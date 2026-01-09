# Corporate UI Component Library

Bu klasör, DepoPanel uygulamasının kurumsal UI bileşenlerini içerir. Tüm bileşenler tutarlı bir tasarım sistemine göre oluşturulmuştur.

## Bileşenler

### Button
- **Variants**: primary, secondary, danger, success, ghost, outline
- **Sizes**: sm (32px), md (40px), lg (48px)
- **Features**: Loading state, icons, fullWidth

```tsx
import { Button } from '@/components/ui';

<Button variant="primary" size="md" leftIcon={<Plus />}>
  Yeni Ekle
</Button>
```

### Input
- **Sizes**: sm, md, lg
- **Features**: Label, error, hint, icons
- **States**: Default, error, disabled

```tsx
import { Input } from '@/components/ui';

<Input
  label="E-posta"
  placeholder="ornek@email.com"
  error={errors.email}
  leftIcon={<Mail />}
/>
```

### Card
- **Variants**: default, outlined, elevated
- **Padding**: none, sm, md, lg
- **Components**: CardHeader, CardBody, CardFooter, CardTitle, CardDescription

```tsx
import { Card, CardHeader, CardBody, CardTitle } from '@/components/ui';

<Card variant="elevated">
  <CardHeader>
    <CardTitle>Başlık</CardTitle>
  </CardHeader>
  <CardBody>İçerik</CardBody>
</Card>
```

### Table
- **Variants**: default, bordered, striped
- **Sizes**: sm, md, lg
- **Components**: TableHead, TableBody, TableRow, TableHeader, TableCell

```tsx
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui';

<Table variant="default">
  <TableHead>
    <TableRow>
      <TableHeader>Ad</TableHeader>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableCell>Değer</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Select
- **Sizes**: sm, md, lg
- **Features**: Label, error, hint, placeholder

```tsx
import { Select } from '@/components/ui';

<Select
  label="Kategori"
  options={[{ value: '1', label: 'Kategori 1' }]}
  error={errors.category}
/>
```

### Modal
- **Sizes**: sm, md, lg, xl, 2xl
- **Features**: Title, description, footer, ESC key support

```tsx
import { Modal } from '@/components/ui';

<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Başlık"
  description="Açıklama"
  size="md"
>
  İçerik
</Modal>
```

### Tabs
- **Variants**: default, pills, underline
- **Sizes**: sm, md, lg
- **Features**: Icons, badges

```tsx
import { Tabs } from '@/components/ui';

<Tabs
  value={activeTab}
  onChange={setActiveTab}
  tabs={[
    { id: '1', label: 'Tab 1', icon: <Icon />, badge: '5' }
  ]}
/>
```

### Badge
- **Variants**: primary, secondary, success, warning, danger
- **Sizes**: sm, md, lg

```tsx
import { Badge } from '@/components/ui';

<Badge variant="success" size="md">
  Aktif
</Badge>
```

## Tasarım İlkeleri

1. **Tutarlılık**: Tüm bileşenler aynı spacing, border-radius ve renk sistemini kullanır
2. **Dark Mode**: Tüm bileşenler dark mode destekler
3. **Responsive**: Mobil-first yaklaşım
4. **Accessibility**: ARIA labels, keyboard navigation, focus states
5. **Performans**: Optimize edilmiş render ve transition'lar

## Theme Kullanımı

```typescript
import { theme, componentTheme } from '@/theme';

// Spacing
<div className={`gap-${theme.spacing.md}`}>

// Component specific
<Button size="md" /> // Uses componentTheme.button.height.md
```

## Stil Kılavuzu

- **Border Radius**: Kartlar için 24px, input/button için 12px
- **Spacing**: 8px katları (8, 12, 16, 24, 32px)
- **Shadows**: Subtle, consistent shadow system
- **Transitions**: 200ms standard transition duration

