<!--
Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>

This file is part of Jump Cutter Browser Extension.

Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Jump Cutter Browser Extension is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
-->

<svelte:options
  immutable={true}
/>
<script lang="ts">
  export let value: string;

  function onChange(e: Event) {
    // So the value doesn't change when the user types, we only want to change it by changing the `value` prop.
    // This is the only reason why we need this component.
    // "Why not just add a `readonly` attrubite?", you might ask. Because it would make it skip form validation.
    (e.target! as HTMLInputElement).value = value;
  }
</script>

<!-- on:input={e => e.target.value = value} -->
<input
  {...$$props}
  on:input={onChange}

  on:input
  on:keydown
/>
