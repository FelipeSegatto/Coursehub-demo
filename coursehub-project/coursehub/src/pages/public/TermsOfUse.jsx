import { CURRENT_TERMS_VERSION } from "../../constants/legalVersions";

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function TermsOfUse() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
        CourseHub
      </p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Termos de Uso</h1>
      <p className="mt-1 text-sm text-gray-400">
        Versão {CURRENT_TERMS_VERSION} · Atualizado em setembro de 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600">
        <p>
          Estes Termos de Uso regulam o acesso e a utilização da plataforma CourseHub
          por alunos, professores, administradores e contratantes. Ao criar uma conta,
          acessar o ambiente ou concluir uma contratação, você declara ter lido e
          concordado com este documento e com a Política de Privacidade vigente.
        </p>

        <Section title="1. Quem somos">
          <p>
            O CourseHub é uma plataforma de gestão educacional que reúne catálogo de
            cursos, matrículas, conteúdos, atividades, frequência, contratos e
            documentos acadêmicos em um único ambiente. A contratada nos documentos
            financeiros e acadêmicos é a instituição identificada nos dados
            institucionais da plataforma.
          </p>
        </Section>

        <Section title="2. Contas e papéis">
          <p>
            Cada usuário acessa o sistema com um papel específico — aluno, professor
            ou administrador. Credenciais são pessoais e intransferíveis. O titular
            da conta é responsável por manter a senha em sigilo e por toda atividade
            realizada com o seu acesso.
          </p>
          <p>
            A conta de aluno nasce com a contratação de um curso ou com cadastro
            feito pela instituição. Não há cadastro avulso de aluno fora desses
            fluxos.
          </p>
        </Section>

        <Section title="3. Contratação, pagamento e matrícula">
          <p>
            A contratação de um curso gera um contrato financeiro e, após a
            confirmação do pagamento (ou outra forma de ativação prevista pela
            instituição, como bolsa ou migração), a matrícula acadêmica correspondente.
            Contrato e matrícula são registros distintos: o contrato descreve as
            condições comerciais; a matrícula descreve o vínculo acadêmico.
          </p>
          <p>
            Ao aceitar estes termos no checkout, o contratante concorda com o plano
            escolhido — valor, forma de pagamento, vencimentos e política de cobrança
            vigentes naquele momento. O texto do contrato gerado na contratação
            prevalece sobre qualquer resumo comercial anterior.
          </p>
        </Section>

        <Section title="4. Cancelamento e desistência">
          <p>
            O contratante pode solicitar o cancelamento de um contrato ainda pendente
            de pagamento, nos termos da interface e das regras da instituição. A
            desistência após a matrícula ativa é um fato acadêmico e financeiro
            próprio, registrado no sistema, e não reativa automaticamente o vínculo
            anterior. Uma nova contratação, quando permitida, gera novo contrato e
            nova matrícula.
          </p>
        </Section>

        <Section title="5. Conteúdo, atividades e documentos">
          <p>
            Materiais, atividades, avaliações e documentos acadêmicos disponibilizados
            na plataforma destinam-se ao uso educacional do aluno matriculado. É
            vedada a redistribuição, venda ou publicação desses materiais sem
            autorização. Certificados, declarações e contratos emitidos pelo CourseHub
            podem ser verificados publicamente pelo código impresso no documento.
          </p>
        </Section>

        <Section title="6. Conduta">
          <p>
            O usuário compromete-se a utilizar o ambiente de forma lícita, respeitosa
            e compatível com o contexto educacional, inclusive no chat institucional.
            A instituição pode restringir o acesso em caso de violação destes termos,
            atraso financeiro nos termos do contrato, ou determinação legal.
          </p>
        </Section>

        <Section title="7. Limitação">
          <p>
            O CourseHub se esforça para manter a plataforma disponível e íntegra, mas
            não garante operação ininterrupta. Conteúdos de cursos, notas, frequência
            e documentos refletem os registros lançados por professores e
            administradores no sistema.
          </p>
        </Section>

        <Section title="8. Alterações">
          <p>
            Estes termos podem ser atualizados. A versão vigente é a identificada
            nesta página e a registrada no aceite do checkout. Contratos já firmados
            permanecem regidos pelas condições congeladas no documento daquela
            contratação, salvo disposição legal em contrário.
          </p>
        </Section>

        <Section title="9. Contato">
          <p>
            Dúvidas sobre estes termos podem ser enviadas pelo canal{" "}
            <a href="/fale-conosco" className="font-medium text-blue-700 hover:underline">
              Fale conosco
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
