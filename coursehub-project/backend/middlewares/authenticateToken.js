const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  try {
    const token = req.cookies?.access_token;

    if (!token) {
      return res.status(401).json({
        message:
          "Token de autenticação não informado.",
      });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        issuer: "coursehub-api",
        audience: "coursehub-web",
        algorithms: ["HS256"],
      }
    );

    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        message:
          "Token inválido: usuário não identificado.",
      });
    }

    req.auth = {
      userId,
      role: payload.role,
    };

    return next();
  } catch (error) {
    console.error(
      "Erro ao verificar token:",
      error
    );

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Token expirado.",
      });
    }

    return res.status(401).json({
      message: "Token inválido.",
    });
  }
}

module.exports = authenticateToken;