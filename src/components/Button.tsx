import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';


interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', children, className = '', disabled, ...props }, ref) => {
    const base =
      'px-6 py-3 rounded-full font-semibold transition-all duration-300 focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary:
        'bg-neon-gradient text-white shadow-neon-glow hover:scale-105 focus:ring-neonPurple/50',
      secondary:
        'border border-neonPurple text-neonPurple hover:bg-neonPurple hover:text-white focus:ring-neonPurple/50',
    };

    return (
      <motion.button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        disabled={disabled}
        whileHover={disabled ? {} : { scale: 1.05 }}
        whileTap={disabled ? {} : { scale: 0.95 }}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
