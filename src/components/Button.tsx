import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

type ButtonMotionProps = HTMLMotionProps<'button'>;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', children, className = '', ...props }, ref) => {
    const base =
      'px-6 py-3 rounded-full font-semibold transition-all duration-300 focus:outline-none focus:ring-4';

    const variants = {
      primary:
        'bg-neon-gradient text-white shadow-neon-glow hover:scale-105',
      secondary:
        'border border-neonPurple text-neonPurple hover:bg-neonPurple hover:text-white',
    };

    return (
      <motion.button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...(props as ButtonMotionProps)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;