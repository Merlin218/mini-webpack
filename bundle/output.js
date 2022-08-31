
  // 使用块作用域，避免污染全局变量
  {
    // 模块数组
    const webpack_modules = [
      (exports, require, module) => {
    // 比如：该代码中包含module.export = xxx,那么在运行时其实是 targetModule.exports = xxx;
    // 这样就可以拿到该模块执行的结果，然后缓存起来。
    const add = require(1);

console.log(add(1, 2));
  },(exports, require, module) => {
    // 比如：该代码中包含module.export = xxx,那么在运行时其实是 targetModule.exports = xxx;
    // 这样就可以拿到该模块执行的结果，然后缓存起来。
    function add(a, b) {
  return a + b;
}

module.exports = add;
  }
    ];
    // 模块缓存
    const cache_webpack_modules = {};

    // 模块请求函数
    
  function webpack_require(moduleId){
    const cacheModule = cache_webpack_modules[moduleId];
    if(cacheModule){
      return cacheModule.exports;
    }
    const targetModule = {exports:{}};
    webpack_modules[moduleId](targetModule.exports, webpack_require, targetModule);
    cache_webpack_modules[moduleId] = targetModule;
    return targetModule.exports;
  }
  

    // 请求入口模块
    webpack_require(0);
  }
  
