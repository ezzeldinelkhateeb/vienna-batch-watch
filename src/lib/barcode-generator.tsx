import React from "react";

const CODE128B_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

export function encodeCode128B(rawText: string): string {
  // Normalize string to ASCII printable characters
  const text = (rawText || "0").replace(/[^\x20-\x7E]/g, "-").trim() || "0";
  const indices: number[] = [104]; // Start Code B
  let sum = 104;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      indices.push(code);
      sum += code * (i + 1);
    }
  }

  const checksum = sum % 103;
  indices.push(checksum);
  indices.push(106); // Stop Code

  let binary = "";
  for (const idx of indices) {
    const widths = CODE128B_PATTERNS[idx];
    if (!widths) continue;
    let isBar = true;
    for (let w = 0; w < widths.length; w++) {
      const count = parseInt(widths[w], 10);
      binary += (isBar ? "1" : "0").repeat(count);
      isBar = !isBar;
    }
  }

  return binary;
}

interface BarcodeSvgProps {
  value: string;
  height?: number;
  barWidth?: number;
  showText?: boolean;
  className?: string;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  height = 48,
  barWidth = 1.6,
  showText = true,
  className = "",
}) => {
  const binary = React.useMemo(() => encodeCode128B(value), [value]);

  // Quiet zones (10 modules on each side)
  const quietZone = 10;
  const totalModules = binary.length + quietZone * 2;
  const svgWidth = totalModules * barWidth;

  // Build rects for consecutive '1' bits
  const rects: React.ReactNode[] = [];
  let currentStart: number | null = null;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      if (currentStart === null) currentStart = i;
    } else {
      if (currentStart !== null) {
        const width = (i - currentStart) * barWidth;
        const x = (quietZone + currentStart) * barWidth;
        rects.push(
          <rect
            key={`bar-${currentStart}`}
            x={x}
            y={0}
            width={width}
            height={height}
            fill="#000000"
          />
        );
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    const width = (binary.length - currentStart) * barWidth;
    const x = (quietZone + currentStart) * barWidth;
    rects.push(
      <rect
        key={`bar-${currentStart}`}
        x={x}
        y={0}
        width={width}
        height={height}
        fill="#000000"
      />
    );
  }

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full block"
        style={{ shapeRendering: "crispEdges" }}
      >
        <rect width="100%" height="100%" fill="#ffffff" />
        {rects}
      </svg>
      {showText && (
        <span className="font-mono text-[11px] font-bold tracking-widest text-slate-900 mt-0.5">
          {value}
        </span>
      )}
    </div>
  );
};
