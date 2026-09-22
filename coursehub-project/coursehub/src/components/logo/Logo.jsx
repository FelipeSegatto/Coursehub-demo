import { useId } from "react";

export default function CourseHubLogo({
  width = 280,
  className = "",
  inverted = false,
}) {
  const titleId = useId();
  const fill = inverted ? "#FFFFFF" : "#0F172A";
  const accent = inverted ? "#FFFFFF" : "#3B82F6";

  return (
    <svg
      width={width}
      viewBox="0 0 360 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={titleId}
      className={className}
    >
      <title id={titleId}>CourseHub</title>

      <g transform="translate(8 12)">
        <path
          d="M30 4L58 18L30 32L2 18L30 4Z"
          fill={fill}
        />

        <path
          d="M12 23V39C12 39 19 47 30 47C41 47 48 39 48 39V23L30 32L12 23Z"
          fill={fill}
        />

        <path
          d="M17 28V36C20.5 39.5 25 41 30 41C35 41 39.5 39.5 43 36V28"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M58 18V36"
          stroke={fill}
          strokeWidth="3"
          strokeLinecap="round"
        />

        <circle
          cx="58"
          cy="40"
          r="4"
          fill={accent}
        />
      </g>

      <text
        x="82"
        y="57"
        fontFamily="Inter, Poppins, Arial, sans-serif"
        fontSize="42"
        fontWeight="700"
        letterSpacing="-1.8"
        fill={fill}
      >
        CourseHub
      </text>
    </svg>
  );
}
