import { FC } from 'react';

export const CharacterPreviewEyes: FC<{ className: string }> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={256}
      height={256}
      viewBox="0 0 256 220"
      fill="none"
      className={className}
    >
      <path
        stroke="#000"
        strokeWidth={4}
        d="m150.165 70.609-15.176 34.275M150.165 185.79l-15.176-34.276"
      />
    </svg>
  );
};
