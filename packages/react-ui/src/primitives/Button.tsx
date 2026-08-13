import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The only button. Buttons are `rounded-md`; a pill on screen always means
 * "this is a tag", never "this is an action".
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost'
  size?: 'md' | 'sm'
  block?: boolean
  icon?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'fk-btn',
    `fk-btn-${variant}`,
    size === 'sm' ? 'fk-btn-sm' : '',
    block ? 'fk-btn-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // `type` defaults to "button": a widget dropped inside a host's form must
    // never submit it by accident.
    <button type={type} className={classes} {...rest}>
      {icon ? <span className={`fk-i fk-i-${icon}`} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
