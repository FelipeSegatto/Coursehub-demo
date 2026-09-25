import {
  useMemo,
  useState,
} from "react";

import {
  CreditCard,
  LockKeyhole,
  CheckCircle2,
  XCircle,
} from "lucide-react";


/**
 * ============================================================
 * COURSEHUB - CARTÃO SIMULADO
 * ============================================================
 *
 * Este componente é usado por:
 *
 * 1. Checkout público
 * 2. Aluno logado comprando novo curso
 * 3. Link privado de pagamento de invoice
 *
 * O projeto original passa:
 *
 * amount
 * onToken
 * submitting
 *
 * Portanto mantemos exatamente esse contrato.
 *
 *
 * IMPORTANTE:
 *
 * Os dados digitados servem SOMENTE para simulação
 * no frontend.
 *
 * Número, CVV e validade NÃO são enviados ao backend.
 *
 * O backend recebe apenas:
 *
 * {
 *   cardToken,
 *   cardPaymentMethodId,
 *   cardInstallments
 * }
 */


/**
 * ============================================================
 * CARTÕES DE TESTE
 * ============================================================
 */

/**
 * APROVADO
 *
 * Número:
 * 4242 4242 4242 4242
 */
const SIMULATED_APPROVED_CARD =
  "4242424242424242";


/**
 * RECUSADO
 *
 * Número:
 * 4000 0000 0000 0002
 */
const SIMULATED_DECLINED_CARD =
  "4000000000000002";


/**
 * Este token já é reconhecido pelo
 * simulatedGateway.js do CourseHub.
 */
const SIMULATED_DECLINED_TOKEN =
  "sim_card_declined";


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function onlyNumbers(value = "") {
  return String(value).replace(
    /\D/g,
    ""
  );
}


/**
 * Formata:
 *
 * 4242424242424242
 *
 * para:
 *
 * 4242 4242 4242 4242
 */
function formatCardNumber(value) {
  const numbers =
    onlyNumbers(value).slice(
      0,
      16
    );

  return numbers.replace(
    /(\d{4})(?=\d)/g,
    "$1 "
  );
}


/**
 * Formata:
 *
 * 1230
 *
 * para:
 *
 * 12/30
 */
function formatExpiration(value) {
  const numbers =
    onlyNumbers(value).slice(
      0,
      4
    );

  if (numbers.length <= 2) {
    return numbers;
  }

  return `${numbers.slice(
    0,
    2
  )}/${numbers.slice(2)}`;
}


/**
 * ============================================================
 * VALIDAÇÃO LUHN
 * ============================================================
 *
 * Verifica se o número possui estrutura válida.
 *
 * Não significa que o cartão existe.
 *
 * Serve apenas para tornar o formulário
 * de desenvolvimento mais próximo do real.
 */
function isValidLuhn(cardNumber) {
  const digits =
    onlyNumbers(cardNumber);

  if (
    digits.length < 13 ||
    digits.length > 19
  ) {
    return false;
  }


  let sum = 0;

  let doubleDigit = false;


  for (
    let index =
      digits.length - 1;
    index >= 0;
    index--
  ) {

    let digit =
      Number(
        digits[index]
      );


    if (doubleDigit) {

      digit *= 2;


      if (digit > 9) {
        digit -= 9;
      }
    }


    sum += digit;

    doubleDigit =
      !doubleDigit;
  }


  return sum % 10 === 0;
}


/**
 * ============================================================
 * VALIDADE
 * ============================================================
 */
function isValidExpiration(value) {

  if (
    !/^\d{2}\/\d{2}$/.test(
      value
    )
  ) {
    return false;
  }


  const [
    monthString,
    yearString,
  ] = value.split("/");


  const month =
    Number(monthString);

  const year =
    Number(yearString);


  if (
    month < 1 ||
    month > 12
  ) {
    return false;
  }


  const now =
    new Date();


  const currentYear =
    Number(
      String(
        now.getFullYear()
      ).slice(-2)
    );


  const currentMonth =
    now.getMonth() + 1;


  if (
    year < currentYear
  ) {
    return false;
  }


  if (
    year === currentYear &&
    month < currentMonth
  ) {
    return false;
  }


  return true;
}


/**
 * ============================================================
 * BANDEIRA
 * ============================================================
 *
 * Aqui só usamos para preencher
 * cardPaymentMethodId no teste.
 */
function detectCardBrand(cardNumber) {

  const number =
    onlyNumbers(cardNumber);


  /**
   * Visa
   */
  if (/^4/.test(number)) {
    return "visa";
  }


  /**
   * Mastercard
   */
  if (
    /^(5[1-5]|2[2-7])/.test(
      number
    )
  ) {
    return "master";
  }


  /**
   * American Express
   */
  if (
    /^3[47]/.test(number)
  ) {
    return "amex";
  }


  /**
   * fallback
   */
  return "visa";
}


/**
 * ============================================================
 * TOKENIZAÇÃO SIMULADA
 * ============================================================
 *
 * É aqui que fazemos o equivalente,
 * em desenvolvimento, à tokenização
 * que seria feita pelo Mercado Pago.
 *
 *
 * CARTÃO RECUSADO
 * ↓
 * sim_card_declined
 *
 *
 * Qualquer outro cartão válido
 * ↓
 * sim_card_approved_xxxxx
 */
function createSimulatedToken(
  cardNumber
) {

  const normalized =
    onlyNumbers(cardNumber);


  if (
    normalized ===
    SIMULATED_DECLINED_CARD
  ) {
    return SIMULATED_DECLINED_TOKEN;
  }


  return (
    "sim_card_approved_" +
    Date.now()
  );
}


/**
 * ============================================================
 * COMPONENTE
 * ============================================================
 */
export default function CreditCardPaymentPanel({
  amount,
  onToken,
  submitting = false,
}) {

  /**
   * ==========================================================
   * FORM
   * ==========================================================
   */
  const [form, setForm] =
    useState({
      holderName: "",
      cardNumber: "",
      expiration: "",
      cvv: "",
      installments: "1",
    });


  /**
   * Mensagem de validação.
   */
  const [error, setError] =
    useState("");


  /**
   * ==========================================================
   * RESULTADO PREVISTO DO TESTE
   * ==========================================================
   */
  const simulatedResult =
    useMemo(() => {

      const number =
        onlyNumbers(
          form.cardNumber
        );


      /**
       * Cartão explicitamente recusado.
       */
      if (
        number ===
        SIMULATED_DECLINED_CARD
      ) {
        return "declined";
      }


      /**
       * Qualquer cartão estruturalmente válido
       * será aprovado pelo simulatedGateway.
       */
      if (
        isValidLuhn(number)
      ) {
        return "approved";
      }


      return null;

    }, [
      form.cardNumber,
    ]);


  /**
   * ==========================================================
   * ATUALIZAR FORM
   * ==========================================================
   */
  function updateField(
    field,
    value
  ) {

    setForm((current) => ({
      ...current,
      [field]: value,
    }));


    /**
     * Remove erro antigo enquanto
     * o usuário corrige os dados.
     */
    setError("");
  }


  /**
   * ==========================================================
   * PREENCHER CARTÃO APROVADO
   * ==========================================================
   */
  function fillApprovedCard() {

    setForm({
      holderName:
        "ALUNO TESTE",

      cardNumber:
        "4242 4242 4242 4242",

      expiration:
        "12/30",

      cvv:
        "123",

      installments:
        "1",
    });


    setError("");
  }


  /**
   * ==========================================================
   * PREENCHER CARTÃO RECUSADO
   * ==========================================================
   */
  function fillDeclinedCard() {

    setForm({
      holderName:
        "ALUNO TESTE",

      cardNumber:
        "4000 0000 0000 0002",

      expiration:
        "12/30",

      cvv:
        "123",

      installments:
        "1",
    });


    setError("");
  }


  /**
   * ==========================================================
   * ENVIAR PAGAMENTO
   * ==========================================================
   */
  async function handleSubmit(event) {

    event.preventDefault();


    if (submitting) {
      return;
    }


    setError("");


    /**
     * ========================================================
     * NOME
     * ========================================================
     */
    if (
      !form.holderName.trim()
    ) {

      setError(
        "Digite o nome impresso no cartão."
      );

      return;
    }


    /**
     * ========================================================
     * NÚMERO
     * ========================================================
     */
    const normalizedCardNumber =
      onlyNumbers(
        form.cardNumber
      );


    if (
      !isValidLuhn(
        normalizedCardNumber
      )
    ) {

      setError(
        "Digite um número de cartão válido."
      );

      return;
    }


    /**
     * ========================================================
     * VALIDADE
     * ========================================================
     */
    if (
      !isValidExpiration(
        form.expiration
      )
    ) {

      setError(
        "Digite uma validade futura no formato MM/AA."
      );

      return;
    }


    /**
     * ========================================================
     * CVV
     * ========================================================
     */
    if (
      !/^\d{3,4}$/.test(
        form.cvv
      )
    ) {

      setError(
        "Digite um CVV de 3 ou 4 dígitos."
      );

      return;
    }


    /**
     * ========================================================
     * PARCELAS
     * ========================================================
     */
    const cardInstallments =
      Number(
        form.installments
      );


    if (
      !Number.isInteger(
        cardInstallments
      ) ||
      cardInstallments < 1 ||
      cardInstallments > 12
    ) {

      setError(
        "Quantidade de parcelas inválida."
      );

      return;
    }


    /**
     * ========================================================
     * TOKEN
     * ========================================================
     *
     * NÃO enviamos:
     *
     * holderName
     * cardNumber
     * expiration
     * cvv
     *
     * para o backend.
     */
    const cardToken =
      createSimulatedToken(
        normalizedCardNumber
      );


    const cardPaymentMethodId =
      detectCardBrand(
        normalizedCardNumber
      );


    /**
     * ========================================================
     * CONTRATO ORIGINAL DO COURSEHUB
     * ========================================================
     *
     * O ZIP original usa:
     *
     * onToken({
     *   cardToken,
     *   cardPaymentMethodId,
     *   cardInstallments
     * })
     *
     * É exatamente isso que fazemos aqui.
     */
    if (
      typeof onToken !==
      "function"
    ) {

      setError(
        "Não foi possível iniciar o pagamento: onToken não foi fornecido."
      );

      console.error(
        "[CreditCardPaymentPanel] prop onToken não encontrada."
      );

      return;
    }


    try {

      await onToken({
        cardToken,
        cardPaymentMethodId,
        cardInstallments,
      });

    } catch (requestError) {

      console.error(
        "[CreditCardPaymentPanel] erro ao enviar token:",
        requestError
      );


      setError(
        requestError?.message ||
          "Não foi possível iniciar o pagamento com cartão."
      );
    }
  }


  /**
   * ==========================================================
   * PARCELAS
   * ==========================================================
   */
  const installmentOptions =
    Array.from(
      {
        length: 12,
      },
      (_, index) =>
        index + 1
    );


  /**
   * ==========================================================
   * VIEW
   * ==========================================================
   */
  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-5"
    >

      {/* ================================================
          BOX DE TESTES
      ================================================= */}

      <div
        className="
          rounded-xl
          border
          border-slate-200
          bg-slate-50
          p-4
        "
      >

        <p
          className="
            text-sm
            font-bold
            text-slate-950
          "
        >
          Gateway simulado
        </p>


        <p
          className="
            mt-1
            text-sm
            leading-5
            text-slate-600
          "
        >
          Você pode digitar os dados
          manualmente ou preencher um
          cenário de teste automaticamente.
        </p>


        <div
          className="
            mt-4
            grid
            gap-3
            sm:grid-cols-2
          "
        >

          {/* APROVADO */}

          <button
            type="button"
            disabled={
              submitting
            }
            onClick={
              fillApprovedCard
            }
            className="
              rounded-lg
              border
              border-emerald-300
              bg-white
              px-3
              py-3
              text-left
              transition
              hover:bg-emerald-50
              disabled:opacity-50
            "
          >

            <span
              className="
                flex
                items-center
                gap-2
                text-sm
                font-bold
                text-emerald-700
              "
            >

              <CheckCircle2
                size={17}
              />

              Preencher aprovado

            </span>


            <span
              className="
                mt-1
                block
                text-xs
                text-gray-500
              "
            >
              4242 4242 4242 4242
            </span>

          </button>


          {/* RECUSADO */}

          <button
            type="button"
            disabled={
              submitting
            }
            onClick={
              fillDeclinedCard
            }
            className="
              rounded-lg
              border
              border-red-300
              bg-white
              px-3
              py-3
              text-left
              transition
              hover:bg-red-50
              disabled:opacity-50
            "
          >

            <span
              className="
                flex
                items-center
                gap-2
                text-sm
                font-bold
                text-red-700
              "
            >

              <XCircle
                size={17}
              />

              Preencher recusado

            </span>


            <span
              className="
                mt-1
                block
                text-xs
                text-gray-500
              "
            >
              4000 0000 0000 0002
            </span>

          </button>

        </div>

      </div>


      {/* ================================================
          NOME
      ================================================= */}

      <div>

        <label
          htmlFor="card-holder"
          className="
            mb-1.5
            block
            text-sm
            font-semibold
            text-gray-700
          "
        >
          Nome no cartão
        </label>


        <input
          id="card-holder"
          type="text"
          value={
            form.holderName
          }
          onChange={(
            event
          ) =>
            updateField(
              "holderName",
              event.target.value
                .toUpperCase()
            )
          }
          placeholder="NOME COMO ESTÁ NO CARTÃO"
          autoComplete="cc-name"
          disabled={
            submitting
          }
          className="
            h-12
            w-full
            rounded-xl
            border
            border-gray-300
            px-4
            text-sm
            outline-none
            transition
            focus:border-slate-950
            focus:ring-2
            focus:ring-slate-200
            disabled:bg-gray-100
          "
        />

      </div>


      {/* ================================================
          NÚMERO
      ================================================= */}

      <div>

        <label
          htmlFor="card-number"
          className="
            mb-1.5
            block
            text-sm
            font-semibold
            text-gray-700
          "
        >
          Número do cartão
        </label>


        <div
          className="relative"
        >

          <CreditCard
            size={18}
            className="
              absolute
              left-4
              top-1/2
              -translate-y-1/2
              text-gray-400
            "
          />


          <input
            id="card-number"
            type="text"
            inputMode="numeric"
            value={
              form.cardNumber
            }
            onChange={(
              event
            ) =>
              updateField(
                "cardNumber",
                formatCardNumber(
                  event.target.value
                )
              )
            }
            placeholder="0000 0000 0000 0000"
            autoComplete="cc-number"
            disabled={
              submitting
            }
            className="
              h-12
              w-full
              rounded-xl
              border
              border-gray-300
              pl-11
              pr-4
              text-sm
              outline-none
              transition
              focus:border-slate-950
              focus:ring-2
              focus:ring-slate-200
              disabled:bg-gray-100
            "
          />

        </div>

      </div>


      {/* ================================================
          VALIDADE + CVV
      ================================================= */}

      <div
        className="
          grid
          grid-cols-2
          gap-4
        "
      >

        <div>

          <label
            htmlFor="card-expiration"
            className="
              mb-1.5
              block
              text-sm
              font-semibold
              text-gray-700
            "
          >
            Validade
          </label>


          <input
            id="card-expiration"
            type="text"
            inputMode="numeric"
            value={
              form.expiration
            }
            onChange={(
              event
            ) =>
              updateField(
                "expiration",
                formatExpiration(
                  event.target.value
                )
              )
            }
            placeholder="MM/AA"
            autoComplete="cc-exp"
            disabled={
              submitting
            }
            className="
              h-12
              w-full
              rounded-xl
              border
              border-gray-300
              px-4
              text-sm
              outline-none
              transition
              focus:border-slate-950
              focus:ring-2
              focus:ring-slate-200
              disabled:bg-gray-100
            "
          />

        </div>


        <div>

          <label
            htmlFor="card-cvv"
            className="
              mb-1.5
              block
              text-sm
              font-semibold
              text-gray-700
            "
          >
            CVV
          </label>


          <input
            id="card-cvv"
            type="password"
            inputMode="numeric"
            value={
              form.cvv
            }
            onChange={(
              event
            ) =>
              updateField(
                "cvv",
                onlyNumbers(
                  event.target.value
                ).slice(
                  0,
                  4
                )
              )
            }
            placeholder="123"
            autoComplete="cc-csc"
            disabled={
              submitting
            }
            className="
              h-12
              w-full
              rounded-xl
              border
              border-gray-300
              px-4
              text-sm
              outline-none
              transition
              focus:border-slate-950
              focus:ring-2
              focus:ring-slate-200
              disabled:bg-gray-100
            "
          />

        </div>

      </div>


      {/* ================================================
          PARCELAS
      ================================================= */}

      <div>

        <label
          htmlFor="card-installments"
          className="
            mb-1.5
            block
            text-sm
            font-semibold
            text-gray-700
          "
        >
          Parcelas
        </label>


        <select
          id="card-installments"
          value={
            form.installments
          }
          onChange={(
            event
          ) =>
            updateField(
              "installments",
              event.target.value
            )
          }
          disabled={
            submitting
          }
          className="
            h-12
            w-full
            rounded-xl
            border
            border-gray-300
            bg-white
            px-4
            text-sm
            outline-none
            transition
            focus:border-slate-950
            focus:ring-2
            focus:ring-slate-200
            disabled:bg-gray-100
          "
        >

          {installmentOptions.map(
            (quantity) => {

              const value =
                Number(amount) /
                quantity;


              return (
                <option
                  key={
                    quantity
                  }
                  value={
                    quantity
                  }
                >
                  {quantity}x de{" "}
                  {value.toLocaleString(
                    "pt-BR",
                    {
                      style:
                        "currency",

                      currency:
                        "BRL",
                    }
                  )}
                </option>
              );
            }
          )}

        </select>

      </div>


      {/* ================================================
          RESULTADO PREVISTO
      ================================================= */}

      {simulatedResult ===
        "approved" && (

        <div
          className="
            flex
            items-center
            gap-2
            rounded-xl
            bg-emerald-50
            px-4
            py-3
            text-sm
            font-semibold
            text-emerald-700
          "
        >

          <CheckCircle2
            size={18}
          />

          Este cartão será APROVADO
          pelo gateway simulado.

        </div>
      )}


      {simulatedResult ===
        "declined" && (

        <div
          className="
            flex
            items-center
            gap-2
            rounded-xl
            bg-red-50
            px-4
            py-3
            text-sm
            font-semibold
            text-red-700
          "
        >

          <XCircle
            size={18}
          />

          Este cartão será RECUSADO
          pelo gateway simulado.

        </div>
      )}


      {/* ================================================
          ERRO
      ================================================= */}

      {error && (

        <div
          className="
            rounded-xl
            border
            border-red-200
            bg-red-50
            px-4
            py-3
            text-sm
            text-red-700
          "
        >
          {error}
        </div>
      )}


      {/* ================================================
          AVISO
      ================================================= */}

      <div
        className="
          flex
          items-start
          gap-2
          text-xs
          leading-5
          text-gray-500
        "
      >

        <LockKeyhole
          size={16}
          className="
            mt-0.5
            shrink-0
          "
        />


        <span>
          Ambiente de desenvolvimento.
          Os dados digitados são usados
          somente para gerar um token
          simulado. Número, validade e
          CVV não são enviados ao backend.
        </span>

      </div>


      {/* ================================================
          SUBMIT
      ================================================= */}

      <button
        type="submit"
        disabled={
          submitting
        }
        className="
          flex
          h-12
          w-full
          items-center
          justify-center
          rounded-xl
          bg-slate-950
          px-5
          text-sm
          font-bold
          text-white
          transition
          hover:bg-slate-800
          disabled:cursor-not-allowed
          disabled:opacity-60
        "
      >

        {submitting
          ? "Processando pagamento..."
          : "Pagar com cartão"}

      </button>

    </form>
  );
}