---
name: Obsidian Precision
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#ffb869'
  on-tertiary: '#482900'
  tertiary-container: '#ca801e'
  on-tertiary-container: '#3f2300'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  h1:
    fontFamily: Roboto Flex
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  h2:
    fontFamily: Roboto Flex
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Roboto Flex
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Roboto Flex
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  table-cell:
    fontFamily: Roboto Flex
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 16px
  mono-id:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: Roboto Flex
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar_width: 208px
  table_row_height: 40px
  base_grid: 8px
  container_padding: 24px
  gutter: 16px
---

## Brand & Style
The design system is engineered for high-density inventory management where speed and data clarity are paramount. It adopts a **Dark Glassmorphism** aesthetic, drawing heavy inspiration from modern macOS and Apple-style precision. The interface balances technical utility with premium visual depth.

The brand personality is professional, restrained, and precise. It focuses on functional translucency—using backdrop blurs and subtle borders to create a sense of organized layers without the visual noise of traditional shadows. The target audience is power users who require complex data visualization and inventory tracking in a focused, low-strain environment.

## Colors
This design system utilizes a tiered color strategy to manage information density. The primary violet is reserved for critical actions and active navigation states, while the secondary blue is used for secondary interactive elements or information linking.

**Glassmorphism Implementation:**
All cards and floating panels must use a `backdrop-filter: blur(16px)` to maintain legibility against the dark or light background. Semantic colors for stock levels and alerts use low-opacity backgrounds with high-contrast text to ensure accessibility without breaking the glass aesthetic.

## Typography
The system relies on **Roboto** for its versatility in high-density layouts. 
- **Tabular Figures:** For all inventory counts, prices, and date columns in tables, enable `tnum` (tabular numbers) to ensure columns align perfectly.
- **Monospace Integration:** Use **JetBrains Mono** for barcodes, SKU IDs, and serial numbers to prevent character confusion (e.g., 0 vs O).
- **Hierarchy:** Typography remains small (13px base) to accommodate massive data sets. Use font weight rather than size to establish hierarchy in the dashboard headers.

## Layout & Spacing
The layout follows a strict **8pt grid** system. The structure is anchored by a fixed 208px left sidebar with a `1px dashed` border on the right (using the mode's border color). 

**Density Rules:**
- Elements should be tightly packed with a default 16px gutter between major components.
- Data tables are the core of the experience; rows are capped at 40px height to maximize vertical data visibility.
- Scrollbars are never hidden. Use a custom `6px` width track with a `4px` thumb, utilizing the accent violet at 20% opacity for the thumb.

## Elevation & Depth
Elevation is communicated through **Translucent Stacking** rather than traditional drop shadows.
- **Level 0 (Base):** Solid #09090b (Dark) or #f8fafc (Light).
- **Level 1 (Cards/Panels):** Glass-morphic surface with 1px border. This level appears "raised" via the backdrop blur effect.
- **Level 2 (Modals/Popovers):** Increased border opacity (rgba(255, 255, 255, 0.24)) and a subtle 20px ambient blur shadow to distinguish it from background cards.

Border treatment: Use `inner` borders for all glass elements to keep the outer edges crisp and aligned with the 8pt grid.

## Shapes
The shape language combines structural logic with ergonomic softness. 
- **Containers:** Cards and navigation containers use a **rounded-xl (12px)** radius, providing a modern, framed feel. 
- **Interactive:** Buttons are strictly **pill-shaped (rounded-full)** to maximize hit-area affordance and distinguish them from data containers.
- **Data Tags:** Status chips use a smaller **4px** radius to maintain a technical "tag" appearance within high-density rows.

## Components
### Buttons
- **Primary:** Background: Accent Violet; Text: White; Shape: Full Pill. 
- **Secondary:** Background: Transparent; Border: 1px mode-border; Text: Mode-Foreground.
- **Ghost:** No background or border until hover. Use for table actions.

### Tables (The Core)
- **Header:** Background: rgba(255, 255, 255, 0.03); Typography: `label-caps`.
- **Rows:** 40px height; 1px solid bottom border (low opacity).
- **Interactive Cells:** Hovering over a row should increase the background opacity to 10%.

### Input Fields
- Background: rgba(0, 0, 0, 0.2) in dark mode; White in light mode.
- Border: 1px solid card-border; focus state uses Accent Blue border with 2px outer glow.

### Sidebar Navigation
- Width: 208px.
- Active State: Text color becomes Accent Violet; a 2px vertical bar appears on the extreme left.
- Icons: 18px size, stroke-width 1.5px.

### Chips & Status
- Use the semantic colors defined in the color section.
- Text is always semi-bold (600) for legibility against the tinted backgrounds.