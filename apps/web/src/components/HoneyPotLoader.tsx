import { type SVGProps, useId } from "react";
import { cn } from "@/lib/utils";

type HoneyPotLoaderSize = "sm" | "md" | "lg";

interface HoneyPotLoaderProps
  extends Omit<SVGProps<SVGSVGElement>, "aria-label"> {
  size?: HoneyPotLoaderSize;
  animationDurationSeconds?: number;
  "aria-label"?: string;
}

const sizeClassName: Record<HoneyPotLoaderSize, string> = {
  sm: "size-8",
  md: "size-16",
  lg: "size-24",
};

const jarPath = `
  M154 150
  C151 166 144 178 132 190
  C118 204 108 217 108 228
  C108 238 112 244 117 250
  C121 255 121 263 116 270
  C110 278 108 286 111 296
  C114 306 123 310 127 318
  C132 328 130 337 137 347
  C143 357 153 360 160 367
  C168 374 169 385 179 391
  C185 395 191 398 201 398
  H316
  C326 398 333 395 339 391
  C349 385 350 374 358 367
  C365 360 375 357 381 347
  C388 337 386 328 391 318
  C395 310 404 306 407 296
  C410 286 408 278 402 270
  C397 263 397 255 401 250
  C406 244 410 238 410 228
  C410 217 400 204 386 190
  C374 178 367 166 364 150
  Z
`;

const innerJarPath = `
  M160 157
  C157 176 150 186 139 198
  C127 211 120 221 120 228
  C120 236 124 241 128 246
  C134 253 134 263 128 271
  C124 277 122 285 125 293
  C128 301 137 305 141 314
  C145 323 144 332 151 341
  C157 349 167 352 174 359
  C181 366 183 376 191 381
  C196 385 201 387 209 387
  H308
  C316 387 321 385 326 381
  C334 376 336 366 343 359
  C350 352 360 349 366 341
  C373 332 372 323 376 314
  C380 305 389 301 392 293
  C395 285 393 277 389 271
  C383 263 383 253 389 246
  C393 241 397 236 397 228
  C397 221 390 211 378 198
  C367 186 360 176 357 157
  Z
`;

const lidPaths = [
  `
    M151 113 H360
    C370 113 378 121 378 132
    C378 143 370 151 360 151
    H151
    C141 151 133 143 133 132
    C133 121 141 113 151 113 Z
  `,
  `
    M151 113 H360
    C370 113 378 121 378 132
    C378 143 370 151 360 151
    H349
    C346 151 344 153 344 157 V165
    C344 173 340 178 334 178
    C328 178 324 173 324 165 V160
    C324 154 320 151 314 151
    H151
    C141 151 133 143 133 132
    C133 121 141 113 151 113 Z
  `,
  `
    M151 113 H360
    C370 113 378 121 378 132
    C378 143 370 151 360 151
    H349
    C346 151 344 153 344 157 V174
    C344 183 340 188 333 188
    C326 188 322 183 322 174 V168
    C322 163 318 160 312 160
    H151
    C141 160 133 152 133 141
    C133 130 141 113 151 113 Z
  `,
  `
    M151 113 H360
    C370 113 378 121 378 132
    C378 143 370 151 360 151
    H349
    C346 151 344 153 344 157
    V181
    C344 190 339 196 331 196
    C323 196 318 190 318 181
    V174
    C318 168 314 164 309 164
    C303 164 299 168 299 174
    V209
    C299 218 294 224 286 224
    C278 224 273 218 273 209
    V166
    C273 157 267 151 258 151
    H151
    C141 151 133 143 133 132
    C133 121 141 113 151 113
    Z
  `,
];

const honeyHeights = [0, 72, 150, 242];
const honeySurfacePaths = [
  "",
  "M116 326 C160 312 190 334 232 322 C272 311 306 332 350 319 C371 313 387 319 402 324 V400 H116 Z",
  "M116 250 C153 237 181 261 219 249 C260 236 286 258 324 246 C357 236 382 248 402 255 V400 H116 Z",
  "M116 162 C151 145 171 172 207 164 C244 156 259 179 295 166 C335 152 359 173 402 158 V400 H116 Z",
];

const stageAnimations = [0, 1, 2, 3]
  .map((stage) => {
    if (stage === 0) {
      // ベースレイヤー（空の壺）: 常に表示
      return `
      @keyframes honey-pot-loader-stage-0 {
        0%, 100% { opacity: 1; }
      }`;
    }
    // 各ステージは順番にフェードインし、表示を維持。サイクル末尾でフェードアウト
    const fadeInStart = stage * 25 - 2;
    const fadeInEnd = stage * 25 + 5;
    return `
      @keyframes honey-pot-loader-stage-${stage} {
        0%, ${fadeInStart}% { opacity: 0; }
        ${fadeInEnd}%, 93% { opacity: 1; }
        100% { opacity: 0; }
      }`;
  })
  .join("\n");

/**
 * はちみつの壺を模したローディングコンポーネント
 * @param option
 * @param option.size ローダーのサイズ。デフォルト：md
 * @param option.animationDurationSeconds アニメーション1サイクル全体の再生速度（秒）。デフォルト：4
 * @param option.className 追加のCSSクラス
 * @param option.ariaLabel アクセシブルなローディング状態のラベル。デフォルト：Loading
 */
function HoneyPotLoader({
  size = "md",
  animationDurationSeconds = 4,
  className,
  "aria-label": ariaLabel = "Loading",
  ...props
}: HoneyPotLoaderProps) {
  const id = useId();
  const honeyGradientId = `${id}-honey`;
  const lidGradientId = `${id}-lid`;
  const clipId = `${id}-clip`;

  return (
    <svg
      viewBox="0 0 512 512"
      role="status"
      aria-label={ariaLabel}
      className={cn(sizeClassName[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <style>
        {`
          ${stageAnimations}

          .honey-pot-loader__stage {
            opacity: 0;
            animation-duration: ${animationDurationSeconds.toString()}s;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }

          .honey-pot-loader__stage--1 {
            animation-name: honey-pot-loader-stage-0;
          }

          .honey-pot-loader__stage--2 {
            animation-name: honey-pot-loader-stage-1;
          }

          .honey-pot-loader__stage--3 {
            animation-name: honey-pot-loader-stage-2;
          }

          .honey-pot-loader__stage--4 {
            animation-name: honey-pot-loader-stage-3;
          }

          @media (prefers-reduced-motion: reduce) {
            .honey-pot-loader__stage {
              animation: none;
            }

            .honey-pot-loader__stage--4 {
              opacity: 1;
            }
          }
        `}
      </style>

      <defs>
        <linearGradient id={honeyGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC43D" />
          <stop offset="0.55" stopColor="#F4B52F" />
          <stop offset="1" stopColor="#E99622" />
        </linearGradient>

        <linearGradient id={lidGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE6A3" />
          <stop offset="1" stopColor="#F2C55D" />
        </linearGradient>

        <clipPath id={clipId}>
          <path d={innerJarPath} />
        </clipPath>
      </defs>

      {/* Transparent jar interior; the inner rim uses the page background color. */}
      <path
        d={jarPath}
        fill="transparent"
        stroke="#202A33"
        strokeWidth="8"
        strokeLinejoin="round"
      />

      <path
        d={innerJarPath}
        fill="transparent"
        stroke="var(--background)"
        strokeWidth="8"
        strokeLinejoin="round"
      />

      {honeyHeights.map((height, index) => {
        const stage = index + 1;
        const surface = honeySurfacePaths[index];

        return (
          <g
            key={stage}
            className={`honey-pot-loader__stage honey-pot-loader__stage--${stage}`}
          >
            <g clipPath={`url(#${clipId})`}>
              {height > 0 && (
                <>
                  <rect
                    x="116"
                    y={400 - height}
                    width="286"
                    height={height}
                    fill={`url(#${honeyGradientId})`}
                  />
                  <path d={surface} fill={`url(#${honeyGradientId})`} />
                </>
              )}
            </g>

            <path
              d={lidPaths[index]}
              fill={index >= 2 ? `url(#${lidGradientId})` : "var(--background)"}
              stroke={
                index === 0
                  ? "#202A33"
                  : index === 1
                    ? "#75684D"
                    : index === 2
                      ? "#C58A1D"
                      : "#202A33"
              }
              strokeWidth="8"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

export { HoneyPotLoader };
