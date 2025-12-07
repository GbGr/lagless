import { FC, SVGProps } from 'react';
import CoinSvg from '../../assets/svg/coin.svg?react'

export const Coin: FC<SVGProps<SVGSVGElement>> = ({ ...props }) => {
  return (
    <CoinSvg {...props} />
  );
};
