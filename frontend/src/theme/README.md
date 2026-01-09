# Corporate UI Design System

Bu dosya, DepoPanel uygulamasının kurumsal UI tasarım sistemini tanımlar. Tüm bileşenler, spacing, renkler, fontlar ve border-radius değerleri bu standartlara göre tanımlanmıştır.

## Theme Yapısı

### Spacing System
- `xs`: 0.5rem (8px)
- `sm`: 0.75rem (12px)
- `md`: 1rem (16px)
- `lg`: 1.5rem (24px)
- `xl`: 2rem (32px)
- `2xl`: 3rem (48px)
- `3xl`: 4rem (64px)

### Border Radius System
- `sm`: 0.375rem (6px)
- `md`: 0.5rem (8px)
- `lg`: 0.75rem (12px) - **Varsayılan**
- `xl`: 1rem (16px)
- `2xl`: 1.5rem (24px) - **Kartlar için**

### Font System
- **Body**: Inter, 14px base
- **Display**: Lexend, başlıklar için
- **Sizes**: xs (12px), sm (14px), base (16px), lg (18px), xl (20px), 2xl (24px)

### Color System
- **Primary**: Blue (#2563eb)
- **Secondary**: Slate (grayscale)
- **Accent**: Purple
- **Success**: Green (#22c55e)
- **Warning**: Amber (#f59e0b)
- **Danger**: Red (#ef4444)

### Component Standards

#### Button
- Heights: sm (32px), md (40px), lg (48px)
- Border-radius: lg (12px)
- Variants: primary, secondary, danger, success, ghost, outline

#### Input
- Heights: sm (32px), md (40px), lg (48px)
- Border-radius: lg (12px)
- Focus ring: primary-500/20

#### Card
- Border-radius: 2xl (24px)
- Padding: sm (16px), md (24px), lg (32px)
- Shadow: sm, md, lg

#### Table
- Cell padding: x (16px), y (16px)
- Border-radius: xl (16px)
- Header font: 12px uppercase

#### Select
- Border-radius: lg (12px)
- Min-height: 40px

## Kullanım

```typescript
import { theme, componentTheme } from '@/theme';

// Spacing kullanımı
<div className={`gap-${theme.spacing.md}`}>

// Component theme kullanımı
<Button size="md" variant="primary" />
```

## Dark Mode

Tüm bileşenler dark mode destekler. Tailwind'in `dark:` prefix'i kullanılarak implement edilmiştir.

