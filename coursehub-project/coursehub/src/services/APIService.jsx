export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function performRequest(endpoint, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,

    credentials: "include",

    headers: isFormData
      ? { ...options.headers }
      : {
          "Content-Type": "application/json",
          ...options.headers,
        },
  });

  const responseText = await response.text();

  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "O servidor retornou uma resposta inválida."
      );
    }
  }

  return { response, data };
}

function buildRequestError(response, data) {
  const error = new Error(
    data.message || "Erro ao realizar requisição."
  );

  error.status = response.status;
  error.data = data;

  return error;
}

// Rotas de autenticação nunca disparam a renovação automática —
// evita loop (a própria /refresh retornando 401 tentaria se renovar).
const ENDPOINTS_WITHOUT_SILENT_REFRESH = new Set([
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

// Compartilhada entre chamadas simultâneas: se várias requisições
// caírem em 401 ao mesmo tempo, só uma delas chama /api/auth/refresh.
let ongoingRefresh = null;

function refreshSession() {
  if (!ongoingRefresh) {
    ongoingRefresh = performRequest("/api/auth/refresh", {
      method: "POST",
    })
      .then(({ response }) => response.ok)
      .catch(() => false)
      .finally(() => {
        ongoingRefresh = null;
      });
  }

  return ongoingRefresh;
}

export async function apiFetch(endpoint, options = {}) {
  const { response, data } = await performRequest(
    endpoint,
    options
  );

  /*
    O access token dura pouco (15 min) de propósito. Em vez de
    derrubar o usuário a cada expiração, tentamos renovar a sessão
    silenciosamente com o refresh token e repetir a requisição uma
    única vez antes de desistir.
  */
  if (
    response.status === 401 &&
    !ENDPOINTS_WITHOUT_SILENT_REFRESH.has(endpoint)
  ) {
    const refreshed = await refreshSession();

    if (refreshed) {
      const retry = await performRequest(endpoint, options);

      if (!retry.response.ok) {
        throw buildRequestError(retry.response, retry.data);
      }

      return retry.data;
    }
  }

  if (!response.ok) {
    throw buildRequestError(response, data);
  }

  return data;
}

export async function apiFetchBlob(endpoint, options = {}) {
  async function performBlobRequest() {
    return fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: { ...options.headers },
    });
  }

  let response = await performBlobRequest();

  if (
    response.status === 401 &&
    !ENDPOINTS_WITHOUT_SILENT_REFRESH.has(endpoint)
  ) {
    const refreshed = await refreshSession();

    if (refreshed) {
      response = await performBlobRequest();
    }
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    throw buildRequestError(response, data);
  }

  return {
    blob: await response.blob(),
    mimeType: response.headers.get("Content-Type") || "",
  };
}
