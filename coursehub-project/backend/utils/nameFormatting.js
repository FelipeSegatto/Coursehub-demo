/**
 * truncateName -- reduz um nome completo ao primeiro nome + inicial do
 * sobrenome ("Lucas Silva Santos" -> "Lucas S."), usado onde a UI
 * pública só pode mostrar identificação PARCIAL do aluno (ver a página
 * de pagamento privado de invoice, /pagamento/fatura) -- nunca o nome
 * completo, que é dado pessoal desnecessário para quem só precisa
 * confirmar "estou pagando a cobrança certa".
 */
function truncateName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

  return `${parts[0]} ${lastInitial}.`;
}

module.exports = { truncateName };
