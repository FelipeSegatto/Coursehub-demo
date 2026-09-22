import { CURRENT_PRIVACY_VERSION } from "../../constants/legalVersions";

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
        CourseHub
      </p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-gray-400">
        Versão {CURRENT_PRIVACY_VERSION} · Atualizado em setembro de 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600">
        <p>
          Esta Política descreve como o CourseHub trata dados pessoais de alunos,
          professores, administradores, contratantes e visitantes, em conformidade
          com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>

        <Section title="1. Quais dados tratamos">
          <p>
            Tratamos dados de identificação e contato (nome, e-mail, telefone, CPF ou
            CNPJ do contratante), dados acadêmicos (matrícula, progresso, atividades,
            notas, frequência), dados financeiros do contrato (plano, faturas,
            situação de pagamento) e registros técnicos de acesso necessários à
            segurança da plataforma.
          </p>
          <p>
            Dados de cartão de crédito ou débito não são coletados nem armazenados
            pelo CourseHub. Quando o pagamento ocorre por provedor externo, o
            processamento é feito diretamente nesse provedor.
          </p>
        </Section>

        <Section title="2. Para que usamos">
          <p>
            Os dados são usados para operar a conta, matricular e acompanhar o aluno,
            emitir cobranças e documentos, comunicar prazos e notificações da
            jornada acadêmica ou financeira, prevenir fraude e cumprir obrigações
            legais. Não vendemos dados pessoais.
          </p>
        </Section>

        <Section title="3. Com quem compartilhamos">
          <p>
            Compartilhamos dados somente com operadores necessários à operação —
            por exemplo, provedor de e-mail, provedor de pagamento e infraestrutura
            de hospedagem — sempre no limite do serviço contratado. Documentos
            acadêmicos podem ser conferidos por terceiro que possua o código de
            verificação impresso no próprio arquivo.
          </p>
        </Section>

        <Section title="4. Base legal e retenção">
          <p>
            O tratamento apoia-se na execução de contrato, no cumprimento de
            obrigação legal e, quando aplicável, no consentimento (por exemplo, o
            aceite registrado no checkout) ou no legítimo interesse de manter a
            segurança da plataforma. Os dados são retidos pelo tempo necessário às
            finalidades acadêmicas, financeiras e legais, inclusive após o término
            do curso quando houver dever de guarda.
          </p>
        </Section>

        <Section title="5. Direitos do titular">
          <p>
            Você pode solicitar confirmação de tratamento, acesso, correção,
            anonimização, portabilidade ou eliminação dos dados, além de informação
            sobre compartilhamentos, nos limites da LGPD. Pedidos podem ser feitos
            pelo canal{" "}
            <a href="/fale-conosco" className="font-medium text-blue-700 hover:underline">
              Fale conosco
            </a>
            .
          </p>
        </Section>

        <Section title="6. Segurança e cookies">
          <p>
            Utilizamos medidas técnicas e organizacionais para proteger as contas,
            incluindo autenticação com sessão segura. Cookies essenciais são usados
            para manter o login e a segurança da sessão. A plataforma não depende de
            cookies de publicidade de terceiros para funcionar.
          </p>
        </Section>

        <Section title="7. Alterações">
          <p>
            Esta política pode ser atualizada. A versão vigente é a identificada
            nesta página e a registrada no aceite do checkout quando a contratação
            ocorre pela plataforma.
          </p>
        </Section>
      </div>
    </div>
  );
}
