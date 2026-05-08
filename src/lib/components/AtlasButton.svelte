<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    href?: string;
    target?: string;
    rel?: string;
    type?: 'button' | 'submit' | 'reset';
    variant?: 'outline' | 'solid';
    onclick?: () => void;
    class?: string;
    'aria-label'?: string;
    children: Snippet;
  }

  let {
    href,
    target,
    rel,
    type = 'button',
    variant = 'outline',
    onclick,
    class: extraClass = '',
    'aria-label': ariaLabel,
    children,
  }: Props = $props();
</script>

{#if href}
  <a
    {href}
    {target}
    {rel}
    {onclick}
    aria-label={ariaLabel}
    class="atlas-btn {variant === 'solid' ? 'atlas-btn--solid' : ''} {extraClass}"
  >
    {@render children()}
  </a>
{:else}
  <button
    {type}
    {onclick}
    aria-label={ariaLabel}
    class="atlas-btn {variant === 'solid' ? 'atlas-btn--solid' : ''} {extraClass}"
  >
    {@render children()}
  </button>
{/if}

<style>
  .atlas-btn {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    font-family: "Google Sans Flex", system-ui, sans-serif;
    text-align: center;
    text-decoration: none;
    transition: background 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s;
    background: transparent;
    border: 1.5px solid var(--color-surface-300);
    border-radius: 8px;
    color: var(--color-surface-500);
    font-size: calc(0.75rem * var(--text-scaling, 1));
    font-weight: 600;
    padding: 0.375rem 1.1rem;
    white-space: nowrap;
    line-height: 1.45;
    vertical-align: middle;
  }

  .atlas-btn:hover {
    background: #2f4daa;
    border-color: transparent;
    color: #fff;
    box-shadow: none;
  }

  .atlas-btn:active {
    transform: translateY(1px);
    box-shadow: 0px 1px 4px 0px rgba(0, 0, 0, 0.12);
  }

  /* Dark mode: fondo oscuro necesita más contraste */
  :global(.dark) .atlas-btn {
    border-color: var(--color-surface-600);
    color: var(--color-surface-400);
  }

  :global(.dark) .atlas-btn:hover {
    background: #2f4daa;
    border-color: transparent;
    color: #fff;
  }

  .atlas-btn--solid {
    background: #2f4daa;
    border-color: transparent;
    color: #fff;
    box-shadow: none;
  }

  .atlas-btn--solid:hover {
    background: #263e88;
    box-shadow: none;
  }

  :global(.dark) .atlas-btn--solid {
    background: #2f4daa;
    border-color: transparent;
    color: #fff;
  }

  :global(.dark) .atlas-btn--solid:hover {
    background: #3a5bbf;
  }
</style>
