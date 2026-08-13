"use strict";
/// <reference types="../../node_modules/.pnpm/@vue+language-core@3.3.5/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../node_modules/.pnpm/@vue+language-core@3.3.5/node_modules/@vue/language-core/types/props-fallback.d.ts" />
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var vue_1 = require("vue");
var props = withDefaults(defineProps(), {
    variant: 'primary',
    size: 'm',
    disabled: false,
    loading: false,
    type: 'button',
    iconOnly: false,
});
var emit = defineEmits();
var isDisabled = (0, vue_1.computed)(function () { return props.disabled || props.loading; });
var buttonClass = (0, vue_1.computed)(function () {
    var _a;
    return (_a = {
            'app-button': true
        },
        _a["app-button--".concat(props.variant)] = true,
        _a["app-button--".concat(props.size)] = true,
        _a['app-button--disabled'] = isDisabled.value,
        _a['app-button--loading'] = props.loading,
        _a['app-button--icon-only'] = props.iconOnly,
        _a);
});
var iconSizeClass = (0, vue_1.computed)(function () {
    // Icon size is fixed regardless of button size
    return 'v-icon-md';
});
function handleClick(e) {
    if (!isDisabled.value) {
        emit('click', e);
    }
}
var __VLS_defaults = {
    variant: 'primary',
    size: 'm',
    disabled: false,
    loading: false,
    type: 'button',
    iconOnly: false,
};
var __VLS_ctx = __assign(__assign(__assign(__assign(__assign({}, {}), {}), {}), {}), {});
var __VLS_components;
var __VLS_intrinsics;
var __VLS_directives;
/** @type {__VLS_StyleScopedClasses['app-button']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--xs']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--s']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--icon-only']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--m']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--icon-only']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--l']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--icon-only']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--xs']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--s']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--m']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--l']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--outlined']} */ ;
/** @type {__VLS_StyleScopedClasses['app-button--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['v-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)(__assign(__assign(__assign({ onClick: (__VLS_ctx.handleClick) }, { type: (__VLS_ctx.type) }), { class: (__VLS_ctx.buttonClass) }), { disabled: (__VLS_ctx.isDisabled) }));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)(__assign({ class: "app-button__content" }));
/** @type {__VLS_StyleScopedClasses['app-button__content']} */ ;
if (__VLS_ctx.loading) {
    var __VLS_0 = void 0;
    /** @ts-ignore @type { | typeof __VLS_components.vProgressCircular | typeof __VLS_components.VProgressCircular | typeof __VLS_components['v-progress-circular']} */
    vProgressCircular;
    // @ts-ignore
    var __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0(__assign({ class: "app-button__spinner" }, { size: (18), width: (2), indeterminate: true })));
    var __VLS_2 = __VLS_1.apply(void 0, __spreadArray([__assign({ class: "app-button__spinner" }, { size: (18), width: (2), indeterminate: true })], __VLS_functionalComponentArgsRest(__VLS_1), false));
    /** @type {__VLS_StyleScopedClasses['app-button__spinner']} */ ;
}
else if (__VLS_ctx.$slots.icon) {
    var __VLS_5 = {
        sizeClass: (__VLS_ctx.iconSizeClass),
    };
}
var __VLS_7 = __assign({ class: "app-button__label" });
var __VLS_9 = {
    sizeClass: (__VLS_ctx.iconSizeClass),
};
// @ts-ignore
var __VLS_6 = __VLS_5, __VLS_8 = __VLS_7, __VLS_10 = __VLS_9;
// @ts-ignore
[handleClick, type, buttonClass, isDisabled, loading, $slots, iconSizeClass, iconSizeClass,];
var __VLS_base = (await Promise.resolve().then(function () { return require('vue'); })).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
var __VLS_export = {};
exports.default = {};
