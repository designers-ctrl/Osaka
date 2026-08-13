<template>
  <div class="app-background">
    <!-- Base solid background -->
    <div class="app-background__base" />

    <!-- Gradient overlay -->
    <div class="app-background__gradient" />

    <!-- Noise texture overlay -->
    <svg
      class="app-background__noise"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      width="1920"
      height="982"
      viewBox="0 0 1920 982"
      fill="none"
      preserveAspectRatio="none"
    >
      <defs>
        <!-- Noise pattern -->
        <pattern
          id="noise-pattern"
          patternUnits="userSpaceOnUse"
          patternTransform="matrix(235.2 0 0 352.8 842.4 402.8)"
          preserveAspectRatio="none"
          viewBox="0 0 336 504"
          width="1"
          height="1"
        >
          <use xlink:href="#noise-inner" transform="translate(-336 0)" />
          <g id="noise-inner">
            <rect width="336" height="252" fill="url(#noise-texture)" />
          </g>
          <use xlink:href="#noise-inner" transform="translate(-168 252)" />
          <use xlink:href="#noise-inner" transform="translate(168 252)" />
        </pattern>

        <!-- Embedded noise texture -->
        <pattern
          id="noise-texture"
          patternContentUnits="objectBoundingBox"
          width="1"
          height="1"
        >
          <image
            id="noise-image"
            width="336"
            height="252"
            preserveAspectRatio="none"
            xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVAAAAD8CAYAAAAhQfz4AAAQAElEQVR4AUTdBZQex7EF4KoJOQ4p7MS0ZrZlZmaZZZaZmZkZZGZmZrbMzMzM7H79tc685Jw9u/vPTHfVrXtvVc8qSTfJJJOUI444oowcObIccsgh5eqrry7vvPNOmX766ct4441XTj755LLCCiuUIUOGlJVWWqksvPDCZZdddin77LNPeeGFF8rdd99d/vrXv5YDDjigHHPMMWXCCScsM800U3n11VfLV199VW6//fZy0kknlTPPPLOstdZaZY455ihvvPFG2X///cvMM8/c7jvooIPaXnvssUc58sgjy9dff11OOOGEMs0007S47Hn88ceXccYZp0w66aTltNNOK/vuu2/5+OOPy4gRI1ocw4cPL4svvnjZbbfdWj7iXmKJJcpRRx1VnnvuufLkk0+Wm266qVx22WVl6qmnLr/5zW9arHfccUdb7y9/+UuL7ayzzioHH3xwy/H5558vP/zwQ/nggw/aPeedd1555ZZBgwaV8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh588MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1122bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh588MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1122bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh588MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1122bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh588MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1122bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh588MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1122bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW+++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW265pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++
/WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32mijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh988MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XXL559/Xh98MFWs2233bY88cQTZeONN257XXvttWWRRRYpq6yySpl22mmL9fbcc8/ia7eKz08//VR+/vnn8swzzxT/ce/mm29e/vvf/zYMl1222bLrrru61Op2xhlnNE4stNBCZZNNNinffvttEZt6wXXTTTct1sSLeeaZpzzwwAPlpZdeKquuumrjDhw32ijsv7665fll1++/O53v2u1OOeccxoHvvvuu/L444+XW25pZxyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9PPzzyyiltzwUWWKDt9dFHH5VBgwa1dU888cRy+umnl3fffbfFNuuss7acYTbxxBOX8ccfv7j33nvvLW++WY5++yzy9NPP12uuuqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflKWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XXTJiqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySeflaWWWqpERFl33XTJiqqqlvc999xT3PfII4+09eT+ySef
"
          />
        </pattern>
      </defs>

      <!-- Apply pattern fill to entire SVG -->
      <rect
        width="1920"
        height="982"
        fill="url(#noise-pattern)"
        fill-opacity="0.16"
        style="mix-blend-mode: multiply"
      />
    </svg>

    <!-- Page content slot -->
    <slot />
  </div>
</template>

<script setup lang="ts">
// Three-layer background system for dark/light modes
// Layer 1: Base solid color (from vuetify theme)
// Layer 2: Gradient overlay (radial, dark mode specific)
// Layer 3: Noise texture (SVG pattern with multiply blend)
</script>

<style scoped lang="scss">
.app-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  overflow: hidden;

  // Layer 1: Base solid background
  &__base {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgb(var(--v-theme-background));
    z-index: 1;
  }

  // Layer 2: Gradient overlay (dark mode)
  &__gradient {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      46.61% 109.78% at 51.61% 55.8%,
      var(--Gray-3, #1b2220) 0%,
      #000 100%
    );
    z-index: 2;
    // Only show in dark mode
    @media (prefers-color-scheme: light) {
      display: none;
    }
  }

  // Layer 3: Noise texture overlay
  &__noise {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
  }
}
</style>
