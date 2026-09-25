import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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

function ChartLegend({ items, colors, format, activeIndex, onActivate, onDeactivate }) {
  return (
    <div className="mt-5 space-y-1">
      {items.map((item, index) => {
        const active = activeIndex === index;

        return (
          <div
            key={item.name}
            className={`flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-sm ${
              active ? "bg-gray-50" : ""
            }`}
            onMouseEnter={() => onActivate(index)}
            onMouseLeave={onDeactivate}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className={active ? "font-medium text-gray-900" : "text-gray-600"}>
                {item.name}
              </span>
            </div>

            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              {format(item.value)}
            </span>
          </div>
        );
      })}
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
  const [activeIndex, setActiveIndex] = useState(null);

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
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {chartData.map((item, index) => (
                <Cell
                  key={`${item.name}-${index}`}
                  fill={chartColors[index % chartColors.length]}
                  opacity={activeIndex == null || activeIndex === index ? 1 : 0.35}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-3xl font-bold text-gray-950">{centerValue}</strong>
          <span className="mt-1 text-xs font-medium text-gray-500">{centerLabel}</span>
        </div>
      </div>

      <ChartLegend
        items={data}
        colors={colors}
        format={format}
        activeIndex={total > 0 ? activeIndex : null}
        onActivate={setActiveIndex}
        onDeactivate={() => setActiveIndex(null)}
      />
    </article>
  );
}
