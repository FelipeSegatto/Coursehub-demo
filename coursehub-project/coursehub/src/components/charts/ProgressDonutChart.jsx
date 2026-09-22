import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/**
 * Gráfico de rosca de progresso, extraído de StudentProgress.jsx pra
 * ser reaproveitado sem duplicação no detalhe administrativo de
 * progressão (AdminStudentProgressDetailPage.jsx) -- mesmos rótulos,
 * cores e regra semântica que o aluno já vê, nunca um cálculo
 * paralelo no JSX do admin.
 */
function normalizeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function ChartLegend({ items, colors, format }) {
  return (
    <div className="mt-5 space-y-2">
      {items.map((item, index) => (
        <div key={item.name} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-gray-600">{item.name}</span>
          </div>

          <span className="font-semibold text-gray-900">{format(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.centerValue
 * @param {string} props.centerLabel
 * @param {{name:string, value:number}[]} props.data
 * @param {string[]} props.colors
 * @param {(value: number) => string} [props.formatValue]
 */
export default function ProgressDonutChart({
  title,
  description,
  centerValue,
  centerLabel,
  data,
  colors,
  formatValue,
}) {
  const format = formatValue || ((value) => value);
  const total = data.reduce((sum, item) => sum + normalizeNumber(item.value), 0);

  // Quando não existem dados, cria uma fatia cinza só pra manter a
  // estrutura visual do gráfico (nunca um gráfico vazio quebrado).
  const chartData = total > 0 ? data : [{ name: "Sem dados", value: 1 }];
  const chartColors = total > 0 ? colors : ["#e5e7eb"];

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
      </div>

      <div className="relative mt-4 h-56" role="img" aria-label={`${title}: ${centerValue} ${centerLabel}. ${data.map((item) => `${item.name}: ${item.value}`).join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={64}
              outerRadius={88}
              paddingAngle={3}
              stroke="none"
            >
              {chartData.map((item, index) => (
                <Cell key={`${item.name}-${index}`} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>

            <Tooltip formatter={(value, name) => [total > 0 ? format(value) : "—", name]} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-3xl font-bold text-gray-950">{centerValue}</strong>
          <span className="mt-1 text-xs font-medium text-gray-500">{centerLabel}</span>
        </div>
      </div>

      <ChartLegend items={data} colors={colors} format={format} />
    </article>
  );
}
