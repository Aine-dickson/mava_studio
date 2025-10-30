# GitHub Copilot

Below is an **atomic catalogue** you can draw from when expanding schemas.  
Organize each control in a schema by referencing these property keys (dot-paths where nested).

---

## Element Types (Core / Future)

- rectangle (shape)  
- circle (ellipse)  
- line  
- arrow  
- polygon  
- star  
- text  
- richText (future)  
- image  
- video  
- audio  
- icon (svg)  
- button (shape + text semantics)  
- hotspot (invisible interactive)  
- linkAnchor  
- inputText  
- textArea  
- checkbox  
- radioGroup  
- switch  
- dropdown  
- slider  
- progress  
- collection (group/container)  
- componentInstance  
- frame / page  
- table  
- chart  
- lottie  
- gif  
- embed (iframe)  
- map  
- overlay / portal  
- guide (ruler guide)  
- commentMarker  
- codeBlock  
- 3dPlaceholder  

---

## Atomic Property Buckets

Use only what applies per element.

### Identity / Structural
- id  
- name  
- type  
- parentId  
- index (stack order within parent)  
- memberIds (collection/group)  
- componentId (for shared instance)  
- variantId  
- locked (edit lock)  
- visible  
- selectable (override)  
- deleted (soft flag)  
- tags[] (future filtering)  

### Geometry / Transform
- x / y  
- width / height  
- minWidth / minHeight  
- maxWidth / maxHeight  
- rotation  
- scaleX / scaleY  
- flipX / flipY  
- pivotX / pivotY  
- zIndex (render order override)  
- constrainProportions (bool)  
- cornerRadius (uniform)  
- borderRadius.dimensions.topLeft / topRight / bottomRight / bottomLeft  
- cornerRadiusScale (scale with resize)  

### Layout (Container / Auto Layout)
- layout.mode (absolute | flex | grid | stack)  
- layout.direction (row | column)  
- layout.wrap (wrap | nowrap)  
- layout.justify (start | center | end | between | around | evenly)  
- layout.align (start | center | end | stretch)  
- layout.alignSelf  
- layout.gap  
- layout.padding.top/right/bottom/left  
- layout.distribute (strategy)  
- layout.autoResize (none | width | height | both)  
- layout.clipContent (bool)  
- layout.scroll (none | vertical | horizontal | both)  
- layout.grid.columns / rows  
- layout.grid.colGap / rowGap  

### Spacing
- margin.top/right/bottom/left  
- padding.top/right/bottom/left  

### Fill / Stroke / Effects
- style.fillColor  
- style.fillGradient.type (linear | radial)  
- style.fillGradient.angle  
- style.fillGradient.stops[] ({ color, offset })  
- style.strokeColor  
- style.strokeWidth  
- style.strokeStyle (solid | dashed | dotted | custom)  
- style.strokeDashArray  
- style.strokeDashOffset  
- style.strokeCap (butt | round | square)  
- style.strokeJoin (miter | round | bevel)  
- style.opacity  
- style.blendMode (normal | multiply | screen | overlay | etc.)  
- style.shadowLevel (none | sm | md | lg | xl)  
- style.shadowCustom ({ x,y,blur,spread,color,inset })  
- style.innerShadow[]  
- style.glow ({ color, blur })  
- style.filter.* (blur, brightness, contrast, hueRotate, saturate, grayscale, invert, sepia)  
- style.backdropFilter.blur (for overlays)  
- style.maskPath  
- style.clipPath  
- style.backgroundImage.url  
- style.backgroundImage.fit (cover | contain | fill | tile)  
- style.backgroundImage.position.x / y  
- style.backgroundRepeat (no-repeat | repeat | repeat-x | repeat-y)  
- style.gradientOverlay (future)  
- style.cursor (pointer | move | crosshair | not-allowed | etc.)  
- style.pointerEvents (auto | none)  

### Text Specific
- style.fontFamily / fontSize / fontWeight / fontStyle  
- style.lineHeight / letterSpacing  
- style.textTransform (none | uppercase | lowercase | capitalize)  
- style.textDecoration (none | underline | line-through | overline)  
- style.textAlign (left | center | right | justify)  
- style.verticalAlign (baseline | middle | top | bottom)  
- style.color  
- style.textShadow  
- text.content (raw string / rich model)  
- text.html (rich mode)  
- text.listType (none | bullet | number)  
- text.listStart  
- text.wrap (normal | nowrap | balance | break-word)  
- text.direction (ltr | rtl)  
- text.hyphenate (bool)  

### Image / Media
- media.src  
- media.alt  
- media.objectFit (fill | contain | cover | none | scale-down)  
- media.objectPosition.x / y  
- media.tintColor  
- media.loop / autoplay / muted  
- media.playbackRate  
- media.poster (video)  
- media.duration (derived)  
- media.startTime / endTime  
- media.controlsVisible (bool)  

### Icon (SVG)
- icon.raw (inline markup)  
- icon.strokeWidth / strokeColor / fillColor  
- icon.preserveAspect (bool)  

### Button / Interactive
- button.label  
- button.variant (primary | secondary | ghost | custom)  
- button.size (sm | md | lg)  
- button.iconLeft / iconRight  
- button.iconSpacing  
- button.stateOverrides.hover/style...  
- disabled (bool)  

### Form Inputs
- input.value / placeholder  
- input.required / readonly / disabled  
- input.min / max / step / pattern  
- input.rows (textArea)  
- checked (checkbox / radio)  
- groupName (radio grouping)  
- options[] (dropdown)  
- selectedIndex (dropdown)  
- slider.min / max / value / step  
- progress.value / max / indeterminate  

### Hotspot / Link / Navigation
- action.targetPageId  
- action.url  
- action.openIn (same | new)  
- action.transition (fade | slide | none)  
- action.delay  
- action.conditions[]  
- tooltip.text / position  

### Collection / Group
- collection.memberIds[]  
- collection.layoutMode (free | vertical | horizontal | grid)  
- collection.autoDistribute (bool)  
- collection.autoSize (width | height | both | none)  
- collection.fitToChildren (bool)  
- collection.wrap (bool)  
- collection.lockMembers (bool)  
- collection.backgroundColor  
- collection.innerPadding.top/right/bottom/left  
- collection.clip (bool)  

### Component Instance
- componentId  
- overrides (map propName → value)  
- lockedProps[]  
- variantId  
- state (default | hover | pressed | disabled | custom)  

### Frame / Page
- metadata.viewport.width / height  
- metadata.devicePreset  
- metadata.scale  
- backgroundColor  
- grid.show  
- grid.type (cols | rows | layout)  
- grid.columns / gutter / margin  
- snapping.enabled / threshold  
- defaults.text.fontFamily / fontSize / color  

### Chart
- chart.type (bar | line | pie | area | donut)  
- chart.data (datasets/labels)  
- chart.palette  
- chart.legend.visible  
- chart.axis.x / y config  
- chart.interpolation  
- chart.showGrid  

### Table
- table.columns[] / rows[]  
- table.cellPadding  
- table.headerStyle  
- table.striped (bool)  
- table.borderColor  

### Embed / Iframe
- embed.src  
- embed.responsive (bool)  
- embed.sandbox  
- embed.allow  
- embed.ratio (16/9 etc.)  

### Lottie / Animation
- animation.data  
- animation.loop  
- animation.autoplay  
- animation.speed  

### Map
- map.center.lat / lng  
- map.zoom  
- map.type  
- map.markers[]  
- map.interactive (bool)  

### Overlay / Portal
- overlay.targetPageId  
- overlay.backdropColor  
- overlay.dismissOnOutside (bool)  
- overlay.animation.in / out  
- overlay.position (center | custom x/y)  

### Code Block
- code.language  
- code.source  
- code.theme  

### Accessibility
- a11y.role  
- a11y.ariaLabel / ariaDescription  
- a11y.tabIndex  
- a11y.ariaHidden  
- a11y.alt (for media)  
- a11y.title  

### Interaction / Events
- events.click[]  
- events.dblclick[]  
- events.hover[]  
- events.key[]  
- events.focus[]  
- events.custom[]  

Each event item:  
```json
{ 
  action: ("navigate" | "openUrl" | "playMedia" | "toggleVisibility" | "setState" | "runScript" | "emitEvent"), 
  params: {} 
}
```

### State & Variants (Future)
- variants[variantId].style overrides
- state.current (default | hover | active | disabled | custom)
- state.map (stateName → style diff)

### Global Tokens (Future Hook)
- tokens.colors.primary / secondary etc.
- tokens.radii.sm / md / lg
- tokens.spacing.xs / sm / md / lg
- tokens.fonts.heading / body / mono