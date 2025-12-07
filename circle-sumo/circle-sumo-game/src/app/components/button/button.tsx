import './button.scss';
import { ButtonHTMLAttributes, FC } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode?: 'primary' | 'secondary' | 'accent' | 'gold' | 'text';
  size?: 'medium' | 'large';
}
export const Button: FC<ButtonProps> = ({ mode = 'primary', size = 'large',  children, ...props }) => {
  return (
    <button className={`button button_${mode} button_${size}`} {...props}>
      {children}
    </button>
  );
}
