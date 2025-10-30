<section class="h-full flex flex-col justify-between">
    <ul class="flex flex-col space-y-2 p-2 items-center">
        {#each navItems as item, index}
            <li>
                <button use:tooltip={{ content: item.name, placement: 'auto' }} type="button" class="cursor-pointer p-1 rounded { $activeSideNav === item.key ? 'bg-slate-300 dark:bg-slate-600' : '' }" on:click={() => setActiveSideNav($activeSideNav === item.key ? null : item.key)}>
                    <svg class="{item.name.toLowerCase() == 'animations' ? 'w-8 h-8' : 'w-6 h-6'} text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                        {@html item.icon}
                    </svg>
                </button>
            </li>
        {/each}
    </ul>
    <ul class="mt-4 flex flex-col space-y-2 p-2 items-center">
        {#each accountNav as item, index}
            <li class="cursor-pointer">
                <svg use:tooltip={{ content: item.name, placement: 'auto' }} class="w-7 h-7 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                    {@html item.icon}
                </svg>
            </li>
        {/each}
    </ul>
</section>

<script lang="ts">
    import { layout, type SideNavKey } from '../stores/layout';
    import { tooltip } from '../lib/actions/tooltip';
    const { activeSideNav, setActiveSideNav } = layout;

    const navItems: { key: SideNavKey; name: string; icon: string }[] = [
        { key: 'structure', name: 'Structure', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v320L680-80H360q-33 0-56.5-23.5T280-160ZM81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710Zm279 110v440h280v-160h160v-280H360Zm220 220Z"/></svg>`},
        { key: 'elements', name: 'Elements', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-520q-83 0-141.5-58.5T40-720q0-84 58.5-142T240-920q84 0 142 58t58 142q0 83-58 141.5T240-520Zm0-80q51 0 85.5-35t34.5-85q0-51-34.5-85.5T240-840q-50 0-85 34.5T120-720q0 50 35 85t85 35ZM640-40q-33 0-56.5-23.5T560-120v-200q0-33 23.5-56.5T640-400h200q33 0 56.5 23.5T920-320v200q0 33-23.5 56.5T840-40H640Zm0-80h200v-200H640v200Zm100-100ZM240-720Zm469 68L308-252q5 12 8.5 25t3.5 27q0 50-34.5 85T200-80q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q14 0 27 3.5t25 8.5l400-401q-5-12-8.5-24.5T640-760q0-51 35-85.5t85-34.5q51 0 85.5 34.5T880-760q0 50-34.5 85T760-640q-14 0-26.5-3.5T709-652Z"/></svg>`},
        { key: 'components', name: 'Components', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-240h220v-160H240v160Zm0-200h220v-280H240v280Zm260 200h220v-280H500v280Zm0-320h220v-160H500v160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v80h80v80h-80v80h80v80h-80v80h80v80h-80v80q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>`},
        { key: 'cf_map', name: 'CF Map', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-80q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-87q0-50 35-85t85-35h160v-127q-35-12-57.5-43T360-760q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 70T520-647v127h160q50 0 85 35t35 85v87q35 12 57.5 43t22.5 70q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-87q0-17-11.5-28.5T680-440H520v127q35 12 57.5 43t22.5 70q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-127H280q-17 0-28.5 11.5T240-400v87q35 12 57.5 43t22.5 70q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T240-200q0-17-11.5-28.5T200-240q-17 0-28.5 11.5T160-200q0 17 11.5 28.5T200-160Zm280 0q17 0 28.5-11.5T520-200q0-17-11.5-28.5T480-240q-17 0-28.5 11.5T440-200q0 17 11.5 28.5T480-160Zm280 0q17 0 28.5-11.5T800-200q0-17-11.5-28.5T760-240q-17 0-28.5 11.5T720-200q0 17 11.5 28.5T760-160ZM480-720q17 0 28.5-11.5T520-760q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720Z"/></svg>` },
        { key: 'assets', name: 'Assets', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Zm140-360q25 0 42.5-17.5T400-620q0-25-17.5-42.5T340-680q-25 0-42.5 17.5T280-620q0 25 17.5 42.5T340-560Z"/></svg>`},
        { key: 'inspector', name: 'Inspector', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-320q17 0 28.5-11.5T520-360q0-17-11.5-28.5T480-400q-17 0-28.5 11.5T440-360q0 17 11.5 28.5T480-320Zm-40-160h80v-200h-80v200Zm40 400q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/></svg>`},
        { key: 'animations', name: 'Animations', icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m438-592 40-116h4l40 116h-84Zm42 232q-100 0-170-70t-70-170q0-100 70-170t170-70q100 0 170 70t70 170q0 100-70 170t-170 70ZM350-480h48l26-72h112l26 72h48L504-760h-50L350-480ZM120-80v-200h80v200h-80Zm160 0v-200h80v200h-80Zm160 0v-200h80v200h-80Zm160 0v-200h240v200H600Z"/></svg>`}
    ];

    const accountNav = [
        { 
            name: 'Profile',  
            icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm246-164q-59 0-99.5-40.5T340-580q0-59 40.5-99.5T480-720q59 0 99.5 40.5T620-580q0 59-40.5 99.5T480-440Zm0 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q53 0 100-15.5t86-44.5q-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160Zm0-360q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm0-60Zm0 360Z"/></svg>`,
            children: [
                { name: 'Billing', href: '/account/billing' },
                { name: 'API Keys', href: '/account/api-keys' },
                { name: 'Integrations', href: '/account/integrations' }
            ] 
        },
        { 
            name: 'Settings', 
            icon: `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>`,
            children: [
                { name: 'General', href: '/settings/general'},
                { name: 'Security', href: '/settings/security'},
                { name: 'Notifications', href: '/settings/notifications'}
            ] 
        },
        
    ];
</script>