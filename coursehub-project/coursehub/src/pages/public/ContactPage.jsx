import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getPublicInstitutionInfo } from "../../services/PublicInstitutionService";
import { requestInvoicePaymentLinkByEmail } from "../../services/PublicInvoicePaymentService";
import { submitContactRequest } from "../../services/PublicContactService";

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="text-sm font-semibold text-gray-500">
        {label}:
      </span>

      <span className="text-sm text-gray-900">
        {value}
      </span>
    </div>
  );
}

export default function ContactPage() {
  const [institution, setInstitution] = useState(null);
  const [institutionError, setInstitutionError] = useState("");

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [formError, setFormError] = useState("");

  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactResultMessage, setContactResultMessage] = useState("");
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    let ignoreRequest = false;

    async function loadInstitution() {
      try {
        const response =
          await getPublicInstitutionInfo();

        if (!ignoreRequest) {
          setInstitution(
            response?.data || null
          );
        }
      } catch (requestError) {
        if (!ignoreRequest) {
          console.error(
            "Erro ao carregar dados institucionais:",
            requestError
          );

          setInstitutionError(
            "Não foi possível carregar as informações de contato agora."
          );
        }
      }
    }

    loadInstitution();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setResultMessage("");

    const trimmedEmail = email.trim();

    if (
      !trimmedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        trimmedEmail
      )
    ) {
      setFormError(
        "Informe um e-mail válido."
      );

      return;
    }

    try {
      setSubmitting(true);

      const response =
        await requestInvoicePaymentLinkByEmail(
          trimmedEmail
        );

      setResultMessage(
        response?.message ||
          "Se houver uma cobrança disponível para este e-mail, enviaremos as instruções de acesso."
      );

      setEmail("");
    } catch (requestError) {
      setFormError(
        requestError.message ||
          "Não foi possível processar sua solicitação agora. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function updateContactField(field) {
    return (event) => setContactForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleContactSubmit(event) {
    event.preventDefault();

    setContactError("");
    setContactResultMessage("");

    const trimmedName = contactForm.name.trim();
    const trimmedEmail = contactForm.email.trim();
    const trimmedSubject = contactForm.subject.trim();
    const trimmedMessage = contactForm.message.trim();

    if (!trimmedName) {
      setContactError("Informe seu nome.");
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setContactError("Informe um e-mail válido.");
      return;
    }

    if (!trimmedSubject) {
      setContactError("Informe o assunto da mensagem.");
      return;
    }

    if (!trimmedMessage) {
      setContactError("Escreva sua mensagem.");
      return;
    }

    try {
      setContactSubmitting(true);

      const response = await submitContactRequest({
        name: trimmedName,
        email: trimmedEmail,
        phone: contactForm.phone.trim(),
        subject: trimmedSubject,
        message: trimmedMessage,
      });

      setContactResultMessage(response?.message || "Mensagem enviada com sucesso. Em breve entraremos em contato.");
      setContactForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (requestError) {
      setContactError(requestError.message || "Não foi possível enviar sua mensagem agora. Tente novamente.");
    } finally {
      setContactSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-slate-900">
        <img
          src="/images/contact-coursehub-hero.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Escurecimento superior para leitura */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/35 to-slate-950/10" />

        <div className="relative mx-auto flex min-h-[460px] max-w-7xl items-start px-6 py-16 lg:min-h-[520px] lg:px-8 lg:py-20">
          <div className="max-w-[620px]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">
              Fale conosco
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Estamos aqui para ajudar.
            </h1>

            <p className="mt-6 max-w-[540px] text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">
              Encontre nossos canais de atendimento e
              informações institucionais em um único lugar.
            </p>
          </div>
        </div>
      </section>

      {/* CONTEÚDO */}
      <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* INFORMAÇÕES INSTITUCIONAIS */}
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
              Atendimento
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Informações institucionais
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Consulte nossos principais canais de contato e
              informações da instituição.
            </p>

            {institutionError && (
              <p className="mt-5 text-sm text-red-600">
                {institutionError}
              </p>
            )}

            {!institutionError &&
              !institution && (
                <p className="mt-5 text-sm text-gray-500">
                  Carregando...
                </p>
              )}

            {institution && (
              <div className="mt-7 space-y-4 border-t border-slate-100 pt-6">
                <InfoRow
                  label="Instituição"
                  value={institution.name}
                />

                <InfoRow
                  label="E-mail de atendimento"
                  value={
                    institution.supportEmail
                  }
                />

                <InfoRow
                  label="Telefone"
                  value={institution.phone}
                />

                <InfoRow
                  label="WhatsApp"
                  value={
                    institution.whatsapp
                  }
                />

                <InfoRow
                  label="Horário de atendimento"
                  value={
                    institution.businessHours
                  }
                />

                <InfoRow
                  label="Endereço"
                  value={
                    institution.address
                  }
                />

                <InfoRow
                  label="CNPJ"
                  value={institution.cnpj}
                />

                {institution.websiteUrl && (
                  <InfoRow
                    label="Site"
                    value={
                      <a
                        href={
                          institution.websiteUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {
                          institution.websiteUrl
                        }
                      </a>
                    }
                  />
                )}
              </div>
            )}
          </section>

          {/* ACESSO À FATURA */}
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
              Financeiro
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Acesse sua fatura
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Perdeu o link de pagamento? Informe o e-mail
              utilizado na contratação para receber novamente
              as instruções de acesso.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-7"
            >
              <label
                htmlFor="invoice-email"
                className="text-sm font-semibold text-slate-700"
              >
                E-mail
              </label>

              <input
                id="invoice-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                placeholder="voce@exemplo.com"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />

              {formError && (
                <p className="mt-3 text-sm text-red-600">
                  {formError}
                </p>
              )}

              {resultMessage && (
                <p className="mt-3 text-sm leading-6 text-emerald-700">
                  {resultMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Enviando..."
                  : "Solicitar link da fatura"}
              </button>
            </form>
          </section>
        </div>

        {/* FORMULÁRIO DE CONTATO */}
        <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Contato</p>

          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Envie uma mensagem</h2>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Tem uma dúvida, sugestão ou pedido que não se encaixa nos canais acima? Escreva para nós.
          </p>

          <form onSubmit={handleContactSubmit} className="mt-7 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className="text-sm font-semibold text-slate-700">
                Nome
              </label>

              <input
                id="contact-name"
                type="text"
                value={contactForm.name}
                onChange={updateContactField("name")}
                placeholder="Seu nome completo"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="text-sm font-semibold text-slate-700">
                E-mail
              </label>

              <input
                id="contact-email"
                type="email"
                value={contactForm.email}
                onChange={updateContactField("email")}
                placeholder="voce@exemplo.com"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="contact-phone" className="text-sm font-semibold text-slate-700">
                Telefone <span className="font-normal text-slate-400">(opcional)</span>
              </label>

              <input
                id="contact-phone"
                type="tel"
                value={contactForm.phone}
                onChange={updateContactField("phone")}
                placeholder="(00) 00000-0000"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="contact-subject" className="text-sm font-semibold text-slate-700">
                Assunto
              </label>

              <input
                id="contact-subject"
                type="text"
                value={contactForm.subject}
                onChange={updateContactField("subject")}
                placeholder="Sobre o que você quer falar?"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="contact-message" className="text-sm font-semibold text-slate-700">
                Mensagem
              </label>

              <textarea
                id="contact-message"
                rows={5}
                value={contactForm.message}
                onChange={updateContactField("message")}
                placeholder="Escreva sua mensagem..."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {contactError && <p className="sm:col-span-2 text-sm text-red-600">{contactError}</p>}

            {contactResultMessage && (
              <p className="sm:col-span-2 text-sm leading-6 text-emerald-700">{contactResultMessage}</p>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={contactSubmitting}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {contactSubmitting ? "Enviando..." : "Enviar mensagem"}
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}