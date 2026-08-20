# Bold, minimal UI without the “AI-generated” look

Researched 2026-08-20. Mobile/accessibility guidance below comes from primary usability references. The “AI look” list is a synthesis of recurring practitioner criticism, not a scientific ranking; any one pattern can be appropriate when it has a product-specific reason.

## Ten patterns to avoid

1. Purple/blue gradients used as a substitute for a palette
2. Glassmorphism, blur, and glowing borders on every surface
3. A centered hero followed by a uniform three-card grid
4. Rounded cards wrapping every piece of content
5. Pill badges for ordinary labels and statuses
6. Default Inter/system typography with no deliberate hierarchy
7. Decorative icon bubbles that do not improve comprehension
8. Bento grids whose geometry matters more than the task
9. Repetitive fade-up animation on every section
10. Generic copy, fake metrics, fake testimonials, or placeholder imagery

The recurring problem is not the individual technique but the interchangeable cluster: vague prompts produce the same palette, geometry, typography, and content across unrelated products. Sources: [Anti-AI-slop design notes](https://github.com/Vitalcheffe/vigie/blob/main/skills/design/horizontal-craft/anti-ai-slop.md), [AI Slop Design](https://vibecodekit.dev/ai-slop-design), and [generated UI worth keeping](https://uxdesign.cc/what-makes-generated-ui-worth-keeping-96b44ade04a1).

## Direction used for Concert Archive

The archive now uses a product-specific **concert-poster/editorial** direction:

- warm paper, near-black ink, one fluorescent accent, and one stage-light red
- oversized compressed headlines paired with an italic editorial face
- hard rules, numbered sections, and list rows instead of generic card grids
- square geometry and almost no shadows, blur, gradients, pills, or decorative motion
- actual Media Items are the dominant visual material
- language comes directly from `CONTEXT.md`

## Mobile requirements applied

- A persistent bottom navigation puts all four primary destinations in thumb reach.
- Primary controls are at least 44–48 CSS pixels high and spaced apart. [web.dev accessible tap targets](https://web.dev/articles/accessible-tap-targets)
- Inputs use 16px text on small screens, preventing iOS focus zoom and improving readability.
- Forms use a single column on mobile, visible labels, semantic controls, and visible focus.
- There are no hover-only interactions or gesture-only controls.
- Safe-area padding keeps navigation clear of Android/iOS system UI.
- Layout is designed at mobile width rather than being a shrunken desktop grid.

References: [MDN mobile accessibility checklist](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Mobile_accessibility_checklist), [MDN mobile accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/Mobile), [Nielsen Norman Group mobile usability](https://www.nngroup.com/reports/mobile-website-and-application-usability/), and [NN/g characteristics of minimalism](https://www.nngroup.com/articles/characteristics-minimalism/).
