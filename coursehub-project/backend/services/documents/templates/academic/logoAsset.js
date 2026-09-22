/**
 * Logo real do CourseHub, inline como string SVG para uso em
 * documentos renderizados no servidor -- markup idêntico a
 * coursehub/src/components/logo/Logo.jsx, só sem as partes
 * específicas de React (props viram parâmetros de função). Nenhuma
 * requisição de rede/imagem: é puro SVG vetorial embutido no HTML.
 */
function buildLogoSvg({ width = 200 } = {}) {
  return `<svg width="${width}" viewBox="0 0 360 88" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="coursehub-logo-title">
  <title id="coursehub-logo-title">CourseHub</title>
  <g transform="translate(8 12)">
    <path d="M30 4L58 18L30 32L2 18L30 4Z" fill="#0F172A" />
    <path d="M12 23V39C12 39 19 47 30 47C41 47 48 39 48 39V23L30 32L12 23Z" fill="#0F172A" />
    <path d="M17 28V36C20.5 39.5 25 41 30 41C35 41 39.5 39.5 43 36V28" stroke="#3B82F6" stroke-width="3" stroke-linecap="round" />
    <path d="M58 18V36" stroke="#0F172A" stroke-width="3" stroke-linecap="round" />
    <circle cx="58" cy="40" r="4" fill="#3B82F6" />
  </g>
  <text x="82" y="57" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="-1.8">
    <tspan fill="#0F172A">CourseHub</tspan>
  </text>
</svg>`;
}

module.exports = { buildLogoSvg };
