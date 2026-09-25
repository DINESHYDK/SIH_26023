# Hero Background Image — Generation Prompt

The landing page hero (`src/components/landing/HeroSection.tsx`) references a static
background image at:

```
frontend/public/hero-background.jpg
```

That file does not exist yet — the component's CSS `background-image` will simply
render an empty/transparent background (falling back to the `bg-surface-dim` color)
until you generate this image and drop it into `frontend/public/`.

## Recommended generation prompt

> A dark, abstract geological visualization for a government mining-intelligence
> platform. Wide cinematic 16:9 aspect ratio. Deep near-black navy background
> (#0B0F17) with layered translucent strata bands suggesting underground coal seams
> and borehole cross-sections, rendered in a subtle topographic/contour-line style.
> Glowing amber-gold accent light (#FBBF24 / #D97706) traces along seam lines and
> data nodes on the left-to-center portion of the frame, fading to soft emerald-green
> highlights (#10B981) on isolated data points, evoking calibrated sensors or verified
> data markers. Faint glowing particle/wireframe overlay suggesting a 3D geological
> mesh or point-cloud scan, semi-transparent, receding into darkness on the right
> half of the frame. No text, no logos, no people, no equipment silhouettes — purely
> abstract/atmospheric. Overall mood: serious, high-tech, sovereign/government-grade,
> precise — not futuristic sci-fi, not decorative. Negative space and darker tones
> concentrated on the left third of the image so overlay text remains legible there;
> more visual density and glow on the right two-thirds. Resolution at least 2400x1350px,
> suitable for a full-bleed website hero background. Style references: geological
> seismic imaging, satellite terrain scans, minimalist data visualization, dark govtech
> dashboards.

## Style constraints (for consistency with the existing design system)

- **Palette:** stay within the existing `mining-gold` (`#FBBF24` bright / `#D97706`
  deep) and `govtech-emerald` (`#10B981`) accent colors against dark backgrounds
  (`surface-base` `#0B0F17` / `surface-dim` `#0f131c` / `surface-card` `#131B2E`).
- **Subject:** abstract mining/geological visualization — strata, borehole cross-
  sections, seismic/contour lines, data point overlays. Avoid literal photos of
  mining equipment, workers, or trucks (keeps it abstract and timeless, and avoids
  looking like stock photography).
- **Composition:** keep the left third relatively dark/low-detail so the overlay
  headline text (rendered by `HeroSection.tsx`) stays legible without additional
  gradient work. The component already layers a left-to-right dark scrim on top of
  whatever image is dropped in, but starting with a naturally darker left side will
  look best.
- **Format:** JPG or WEBP, landscape, at least 2400px wide. Save as
  `frontend/public/hero-background.jpg` (or update the `HeroSection.tsx` background
  reference if you use a different filename/extension).
