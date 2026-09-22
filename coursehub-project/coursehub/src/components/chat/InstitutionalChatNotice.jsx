/**
 * Exact wording from the master prompt -- must stay visible on
 * conversation opening and inside the conversation itself, and must
 * never use "privado"/"secreto" (this is an institutional channel,
 * not a private one: authorized staff can access it for support,
 * security, and audit).
 */
export default function InstitutionalChatNotice({ className = "" }) {
  return (
    <p className={`text-xs text-gray-500 ${className}`}>
      Canal institucional. Conversas podem ser acessadas pela gestão autorizada para atendimento,
      segurança e auditoria.
    </p>
  );
}
