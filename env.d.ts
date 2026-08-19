/// <reference types="vite/client" />
/// <reference types="vite-plugin-vue-layouts-next/client" />

/*
 * `@carbon/icons-vue` ships no type declarations; TypeScript infers the barrel
 * from its JS. That inference breaks for ONE icon: the barrel exports the name
 * `Copy24` twice (from `copy/24` and `image--copy/24`), so the binding is
 * ambiguous and reports as missing. src/icons/carbon.ts imports that one module
 * directly, and this declares it. Remove both if the package fixes the
 * duplicate or starts shipping types.
 */
declare module '@carbon/icons-vue/es/copy/24.js' {
  import type { FunctionalComponent, SVGAttributes } from 'vue'
  const Copy24: FunctionalComponent<SVGAttributes>
  export default Copy24
}
