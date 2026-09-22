import { API_URL } from "../../services/APIService";

function formatPoints(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "0";
  }

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function SubmissionAnswerReviewCard({
  answer = {},
  questionNumber,
  readOnly = false,
  answerLabel = "Resposta do aluno",
  onScoreChange = () => {},
  onFeedbackChange = () => {},
}) {
  const {
    answer_id,
    question_text = "Questão sem enunciado.",
    question_type,
    max_points = 0,
    selected_option_text,
    selected_option_is_correct,
    answer_text,
    file_url,
    score_awarded,
    answer_feedback,
  } = answer;

  const isMultipleChoice =
    question_type === "multiple_choice";

  const isText = question_type === "text";

  const isUpload = question_type === "upload";

  const selectedOptionIsCorrect =
    selected_option_is_correct === 1 ||
    selected_option_is_correct === true ||
    selected_option_is_correct === "1";

  const normalizedScore =
    score_awarded === null ||
    score_awarded === undefined
      ? ""
      : score_awarded;

  const normalizedFeedback =
    answer_feedback === null ||
    answer_feedback === undefined
      ? ""
      : answer_feedback;

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Questão {questionNumber}
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-900">
            {question_text}
          </h2>
        </div>

        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
          Máximo: {formatPoints(max_points)} ponto(s)
        </span>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-gray-700">
          {answerLabel}
        </p>

        {isMultipleChoice && (
          <div
            className={`mt-3 rounded-xl border p-4 ${
              selectedOptionIsCorrect
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                selectedOptionIsCorrect
                  ? "text-green-800"
                  : "text-red-800"
              }`}
            >
              {selected_option_text ||
                "Nenhuma alternativa selecionada."}
            </p>

            <p
              className={`mt-2 text-xs font-medium ${
                selectedOptionIsCorrect
                  ? "text-green-700"
                  : "text-red-700"
              }`}
            >
              {selectedOptionIsCorrect
                ? "Alternativa correta"
                : "Alternativa incorreta"}
            </p>
          </div>
        )}

        {isText && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
            {answer_text ||
              "Nenhuma resposta foi informada."}
          </div>
        )}

        {isUpload && (
          <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
            {file_url ? (
              <a
                href={
                  String(file_url).startsWith("/api/files/")
                    ? `${API_URL}${file_url}`
                    : file_url
                }
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-purple-700 underline hover:text-purple-800"
              >
                Abrir arquivo enviado
              </a>
            ) : (
              <p className="text-sm text-purple-700">
                Nenhum arquivo foi anexado.
              </p>
            )}
          </div>
        )}

        {!isMultipleChoice && !isText && !isUpload && (
          <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
            Tipo de questão não reconhecido.
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-5 border-t border-gray-100 pt-5 md:grid-cols-[180px_1fr]">
        <label className="block text-sm font-medium text-gray-700">
          Pontos atribuídos

          <input
            type="number"
            min="0"
            max={Number(max_points) || 0}
            step="0.1"
            value={normalizedScore}
            disabled={readOnly}
            onChange={(event) =>
              onScoreChange(
                answer_id,
                event.target.value
              )
            }
            className={inputClass}
          />

          <span className="mt-1 block text-xs text-gray-500">
            Máximo: {formatPoints(max_points)}
          </span>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Feedback da questão

          <textarea
            rows="4"
            value={normalizedFeedback}
            disabled={readOnly}
            onChange={(event) =>
              onFeedbackChange(
                answer_id,
                event.target.value
              )
            }
            placeholder="Escreva uma orientação específica para esta resposta..."
            className={inputClass}
          />
        </label>
      </div>
    </article>
  );
}

export default SubmissionAnswerReviewCard;