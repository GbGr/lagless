import { FC } from 'react';

export const CharacterPreviewJams: FC<{ color: string, className: string }> = ({ color, className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={256}
      height={256}
      fill="none"
      viewBox={`0 0 256 220`}
      className={className}
    >
      <path
        fill={color}
        stroke={color}
        d="M92.655 19.794C63.9 62.837 65.498 128.198 65.498 128.198S63.9 193.163 92.655 236.207c-15.336-2.232-29.021-8.617-33.947-11.407-16.773-38.261-19.968-67.307-19.968-67.307H4.453C.06 141.949.4 128 .4 128s-.34-13.949 4.054-29.493H38.74S41.935 69.461 58.71 31.2c4.925-2.79 18.61-9.175 33.946-11.406Z"
      />
    </svg>
  );
};
