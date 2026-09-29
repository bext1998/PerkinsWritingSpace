import {type ClassValue, clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const errText = (e: unknown) => String((e as Error)?.message ?? e)

export const baseName = (p: string) => p.split('/').pop()!.replace(/\.md$/, '')
