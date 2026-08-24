// ไอคอนช่องทางติดต่อ — lucide เลิกแถมไอคอนแบรนด์แล้ว วาดเองแบบเรียบๆ ให้เข้าชุดกัน
// (stroke-based 24x24 เหมือน lucide)

interface IconProps {
  size?: number
  className?: string
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function LineIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M21 10.5c0-4.1-4-7.5-9-7.5s-9 3.4-9 7.5c0 3.7 3.2 6.8 7.5 7.4.3.1.7.2.8.5.1.3.1.7 0 1l-.1.8c0 .3-.2 1 .9.6 1.1-.5 5.9-3.5 8-6 1.3-1.4 1.9-2.9 1.9-4.3z" />
    </svg>
  )
}

export function FacebookIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3H9v9h3v-9h2.6l.4-3H12V6.5a1 1 0 0 1 1-1h2V3z" />
    </svg>
  )
}

export function InstagramIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
