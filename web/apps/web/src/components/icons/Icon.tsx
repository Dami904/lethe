import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'

type IconProps = {
  icon: IconSvgElement
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ icon, size = 24, strokeWidth = 1.5, className }: IconProps) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} className={className} />
}
