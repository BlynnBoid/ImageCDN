import { customAlphabet } from 'nanoid'

// URL-safe, visually unambiguous alphabet (no 0/O, 1/l/I)
const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'

export const imageSlug  = customAlphabet(alphabet, 8)
export const albumSlug  = customAlphabet(alphabet, 6)
export const keyPrefix  = customAlphabet(alphabet, 8)
export const keySecret  = customAlphabet(alphabet, 32)
