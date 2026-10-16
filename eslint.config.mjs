import globals from 'globals';
export default [{
 files:['src/**/*.{js,jsx}','runtime/**/*.mjs','electron/**/*.mjs','worker/**/*.js'],
 languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},
 rules:{'no-undef':['error',{typeof:true}],'no-global-assign':'error','no-redeclare':'error'},
}];
