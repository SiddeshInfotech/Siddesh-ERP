/**
 * Code 128 (Set B) SVG Barcode Generator
 * Generates vector SVG markup for high-density 1D barcode scanning.
 */

// Pattern widths for Code 128 symbols (0 to 106).
// Each array represents alternating bar/space module widths [b1, s1, b2, s2, b3, s3].
const CODE128_PATTERNS: Record<number, number[]> = {
  0: [2, 1, 2, 2, 2, 2],
  1: [2, 2, 2, 1, 2, 2],
  2: [2, 2, 2, 2, 2, 1],
  3: [1, 2, 1, 2, 2, 3],
  4: [1, 2, 1, 3, 2, 2],
  5: [1, 3, 1, 2, 2, 2],
  6: [1, 2, 2, 2, 1, 3],
  7: [1, 2, 2, 3, 1, 2],
  8: [1, 3, 2, 2, 1, 2],
  9: [2, 2, 1, 2, 1, 3],
  10: [2, 2, 1, 3, 1, 2],
  11: [2, 3, 1, 2, 1, 2],
  12: [1, 1, 2, 2, 3, 2],
  13: [1, 2, 2, 1, 3, 2],
  14: [1, 2, 2, 2, 3, 1],
  15: [1, 1, 3, 2, 2, 2],
  16: [1, 2, 3, 1, 2, 2],
  17: [1, 2, 3, 2, 2, 1],
  18: [2, 2, 3, 2, 1, 1],
  19: [2, 2, 1, 1, 3, 2],
  20: [2, 2, 1, 2, 3, 1],
  21: [2, 1, 3, 2, 1, 2],
  22: [2, 2, 3, 1, 1, 2],
  23: [3, 1, 2, 1, 3, 1],
  24: [3, 1, 1, 2, 2, 2],
  25: [3, 2, 1, 1, 2, 2],
  26: [3, 2, 1, 2, 2, 1],
  27: [3, 1, 2, 2, 1, 2],
  28: [3, 2, 2, 1, 1, 2],
  29: [3, 2, 2, 2, 1, 1],
  30: [2, 1, 2, 1, 2, 3],
  31: [2, 1, 2, 3, 2, 1],
  32: [2, 3, 2, 1, 2, 1],
  33: [1, 1, 1, 3, 2, 3],
  34: [1, 3, 1, 1, 2, 3],
  35: [1, 3, 1, 3, 2, 1],
  36: [1, 1, 2, 3, 1, 3],
  37: [1, 3, 2, 1, 1, 3],
  38: [1, 3, 2, 3, 1, 1],
  39: [2, 1, 1, 3, 1, 3],
  40: [2, 3, 1, 1, 1, 3],
  41: [2, 3, 1, 3, 1, 1],
  42: [1, 1, 2, 1, 3, 3],
  43: [1, 1, 2, 3, 3, 1],
  44: [1, 3, 2, 1, 3, 1],
  45: [1, 1, 3, 1, 2, 3],
  46: [1, 1, 3, 3, 2, 1],
  47: [1, 3, 3, 1, 2, 1],
  48: [3, 1, 3, 1, 2, 1],
  49: [2, 1, 1, 3, 3, 1],
  50: [2, 3, 1, 1, 3, 1],
  51: [2, 1, 3, 1, 1, 3],
  52: [2, 1, 3, 3, 1, 1],
  53: [2, 1, 3, 1, 3, 1],
  54: [3, 1, 1, 1, 2, 3],
  55: [3, 1, 1, 3, 2, 1],
  56: [3, 3, 1, 1, 2, 1],
  57: [3, 1, 2, 1, 1, 3],
  58: [3, 1, 2, 3, 1, 1],
  59: [3, 3, 2, 1, 1, 1],
  60: [3, 1, 4, 1, 1, 1],
  61: [2, 2, 1, 4, 1, 1],
  62: [4, 3, 1, 1, 1, 1],
  63: [1, 1, 1, 2, 2, 4],
  64: [1, 1, 1, 4, 2, 2],
  65: [1, 2, 1, 1, 2, 4],
  66: [1, 2, 1, 4, 2, 1],
  67: [1, 4, 1, 1, 2, 2],
  68: [1, 4, 1, 2, 2, 1],
  69: [1, 1, 2, 2, 1, 4],
  70: [1, 1, 2, 4, 1, 2],
  71: [1, 2, 2, 1, 1, 4],
  72: [1, 2, 2, 4, 1, 1],
  73: [1, 4, 2, 1, 1, 2],
  74: [1, 4, 2, 2, 1, 1],
  75: [2, 4, 1, 2, 1, 1],
  76: [2, 2, 1, 1, 1, 4],
  77: [4, 1, 3, 1, 1, 1],
  78: [2, 4, 1, 1, 1, 2],
  79: [1, 3, 4, 1, 1, 1],
  80: [1, 1, 1, 2, 4, 2],
  81: [1, 2, 1, 1, 4, 2],
  82: [1, 2, 1, 2, 4, 1],
  83: [1, 1, 4, 2, 1, 2],
  84: [1, 2, 4, 1, 1, 2],
  85: [1, 2, 4, 2, 1, 1],
  86: [4, 1, 1, 2, 1, 2],
  87: [4, 2, 1, 1, 1, 2],
  88: [4, 2, 1, 2, 1, 1],
  89: [2, 1, 2, 1, 4, 1],
  90: [2, 1, 4, 1, 2, 1],
  91: [4, 1, 2, 1, 2, 1],
  92: [1, 1, 1, 1, 4, 3],
  93: [1, 1, 1, 3, 4, 1],
  94: [1, 3, 1, 1, 4, 1],
  95: [1, 1, 4, 1, 1, 3],
  96: [1, 1, 4, 3, 1, 1],
  97: [4, 1, 1, 1, 1, 3],
  98: [4, 1, 1, 3, 1, 1],
  99: [1, 1, 3, 1, 4, 1],
  100: [1, 1, 4, 1, 3, 1],
  101: [3, 1, 1, 1, 4, 1],
  102: [4, 1, 1, 1, 3, 1],
  103: [2, 1, 1, 4, 1, 2], // Start A
  104: [2, 1, 1, 2, 1, 4], // Start B
  105: [2, 1, 1, 2, 3, 2], // Start C
  106: [2, 3, 3, 1, 1, 1, 2] // Stop (7 widths)
}

export interface BarcodeOptions {
  height?: number
  moduleWidth?: number
  quietZone?: number
  includeText?: boolean
  textColor?: string
  barColor?: string
}

/**
 * Encodes text into Code 128-B bars and returns SVG element string.
 */
export function generateCode128Svg(text: string, options: BarcodeOptions = {}): string {
  const {
    height = 50,
    moduleWidth = 2,
    quietZone = 10,
    includeText = true,
    textColor = '#09090b',
    barColor = '#09090b'
  } = options

  const sanitized = text.trim()
  if (!sanitized) return ''

  const codes: number[] = [104] // Start Code B

  for (let i = 0; i < sanitized.length; i++) {
    const charCode = sanitized.charCodeAt(i)
    if (charCode >= 32 && charCode <= 126) {
      codes.push(charCode - 32)
    } else {
      codes.push(63 - 32)
    }
  }

  // Calculate checksum modulo 103
  let checksum = codes[0]
  for (let i = 1; i < codes.length; i++) {
    checksum += i * codes[i]
  }
  checksum %= 103
  codes.push(checksum)

  // Append Stop symbol
  codes.push(106)

  // Calculate module elements
  const moduleElements: boolean[] = []

  // Left Quiet zone
  for (let q = 0; q < quietZone; q++) {
    moduleElements.push(false)
  }

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0]
    let isBar = true
    for (const width of pattern) {
      for (let w = 0; w < width; w++) {
        moduleElements.push(isBar)
      }
      isBar = !isBar
    }
  }

  // Right Quiet zone
  for (let q = 0; q < quietZone; q++) {
    moduleElements.push(false)
  }

  const totalWidth = moduleElements.length * moduleWidth
  const textHeight = includeText ? 16 : 0
  const svgHeight = height + textHeight

  let rectsSvg = ''
  let currentX = 0

  for (let i = 0; i < moduleElements.length; i++) {
    if (moduleElements[i]) {
      let runLength = 1
      while (i + 1 < moduleElements.length && moduleElements[i + 1]) {
        runLength++
        i++
      }
      const rectWidth = runLength * moduleWidth
      rectsSvg += `<rect x="${currentX}" y="0" width="${rectWidth}" height="${height}" fill="${barColor}" />`
      currentX += rectWidth
    } else {
      currentX += moduleWidth
    }
  }

  const textSvg = includeText
    ? `<text x="${totalWidth / 2}" y="${svgHeight - 2}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="600" fill="${textColor}">${sanitized}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${svgHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${rectsSvg}${textSvg}</svg>`
}
