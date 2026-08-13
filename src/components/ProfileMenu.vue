<!--
  src/components/ProfileMenu.vue

  The account dropdown opened from the workspace avatar (Figma "Profile
  Dropdown", node 1769:38716; avatar active state, node 1185:37523).

  Built on v-menu so toggle-on-click, click-outside, Escape, anchoring and
  focus return all come from Vuetify rather than a hand-rolled overlay. The
  activator is a real <button> wrapping the avatar, so Enter/Space and the
  aria-expanded / aria-haspopup wiring v-menu stamps on it work for free.

  Avatar states (ring drawn by a masked ::before, same technique as
  AppButton's outlined variant, so it never shifts layout):
  - default: bare avatar
  - hover / focus-visible: 1px Gray/W 40% ring (button-gray-w-40)
  - open: accent gradient ring (button-outlined-accent-1 → -2) — the same
    gradient-border treatment AppButton uses; it stays while the menu is open
    and wins over hover.

  Card: the workspace glass card surface (.surface--card from surfaces.scss),
  a profile header (avatar · name/email · TokensBadge), then the standard
  dropdown list pattern from the Storybook Overlays/Lists sections.

  Props:
    user - { name, initials, email, tokens }

  Events:
    settings / help / logout - the corresponding item was clicked (the menu
    closes itself first; navigation is the screen's job)

  Example usage:
    <profile-menu :user="data.user" @logout="signOut" />
-->

<script setup lang="ts">
  import { ref } from 'vue'
  import TokensBadge from '@/components/TokensBadge.vue'

  export interface ProfileMenuUser {
    name: string
    initials: string
    email: string
    tokens: number
  }

  defineProps<{ user: ProfileMenuUser }>()

  const emit = defineEmits<{
    settings: []
    help: []
    logout: []
  }>()

  const open = ref(false)
</script>

<template>
  <v-menu v-model="open" location="bottom end" :offset="8">
    <template #activator="{ props: activatorProps }">
      <button
        v-bind="activatorProps"
        type="button"
        class="profile-menu-activator"
        :class="{ 'profile-menu-activator--open': open }"
        :aria-label="`${user.name} — account menu`"
      >
        <v-avatar color="surface-light" size="40">
          <span class="text-label-medium font-weight-medium">{{ user.initials }}</span>
        </v-avatar>
      </button>
    </template>

    <v-sheet class="profile-menu-card surface--card" width="260">
      <!-- Profile header: avatar · name/email · token balance -->
      <div class="d-flex align-center ga-3 pa-3">
        <v-avatar color="surface-light" size="40">
          <span class="text-label-medium font-weight-medium">{{ user.initials }}</span>
        </v-avatar>
        <div class="profile-menu-card__identity flex-grow-1">
          <div class="text-label-large font-weight-medium text-truncate">{{ user.name }}</div>
          <div class="text-body-small text-medium-emphasis text-truncate">{{ user.email }}</div>
        </div>
        <tokens-badge :count="user.tokens" />
      </div>

      <v-divider />

      <!-- Standard dropdown list pattern (Storybook · Overlays / Lists) -->
      <v-list density="comfortable" nav class="bg-transparent pa-2">
        <v-list-item prepend-icon="settings" title="Settings" @click="emit('settings')" />
        <v-list-item prepend-icon="help" title="Help Center" @click="emit('help')" />
        <v-divider class="my-1" />
        <v-list-item prepend-icon="logout" title="Log out" base-color="error" @click="emit('logout')" />
      </v-list>
    </v-sheet>
  </v-menu>
</template>

<style scoped>
  .profile-menu-activator {
    position: relative;
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
    cursor: pointer;
  }

  /* The ring: a masked pseudo-element so hover/open never nudge the avatar.
     Same mask-composite technique as AppButton's gradient border. */
  .profile-menu-activator::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 1px;
    border-radius: inherit;
    background: transparent;
    pointer-events: none;
    /* v-avatar is positioned, so without this the ring paints underneath it */
    z-index: 1;
    transition: background 0.15s ease;
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
  }

  /* Hover / keyboard focus: subtle Gray/W 40% ring */
  .profile-menu-activator:hover:not(.profile-menu-activator--open)::before,
  .profile-menu-activator:focus-visible:not(.profile-menu-activator--open)::before {
    background: rgba(var(--v-theme-button-gray-w-40));
  }

  /* Menu open: accent gradient ring — declared after hover and guarded by
     :not() above, so it wins for as long as the menu stays open. */
  .profile-menu-activator--open::before {
    background: linear-gradient(
      180deg,
      rgb(var(--v-theme-button-outlined-accent-1)) 0%,
      rgb(var(--v-theme-button-outlined-accent-2)) 100%
    );
  }

  .profile-menu-activator:focus-visible {
    outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
    outline-offset: 2px;
  }

  /* text-truncate needs a shrinkable flex child */
  .profile-menu-card__identity {
    min-width: 0;
  }
</style>
