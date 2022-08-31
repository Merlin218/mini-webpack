const path = require('path');
const fs = require('fs');

// 负责 code -> ast
const { parse } = require('@babel/parser')
// 负责 ast -> ast
const traverse = require('@babel/traverse').default
// 负责 ast -> code
const generate = require('@babel/generator').default

let moduleId = 0;

/**
 * 根据入口文件，深度优先遍历，获得模块树
 * @param {string} entry 
 */
function buildModules(entry) {
  // 将相对路径转化为绝对路径
  entry = path.resolve(__dirname, entry);
  // 读取入口文件内容
  const code = fs.readFileSync(entry, 'utf-8');

  // 使用babel解析源码，生成AST树
  const ast = parse(code, {
    sourceType: 'module'
  })

  const deps = [];
  // 本模块的id
  const currentModuleId = moduleId;

  // 进入转化过程，会遍历所有的node，我们可以对对应的node进行处理
  traverse(ast, {
    enter({ node }) {
      // 如果当前是 require函数，寻找所有的依赖
      if (node.type === 'CallExpression' && node.callee.name === 'require') {
        const modulePath = node.arguments[0];

        // 找到模块名
        if (modulePath.type === 'StringLiteral') {
          // 深入优先搜索，当寻找到一个依赖时，全局变量moduleId自增1
          // 并递归进入该模块，解析该模块的依赖树
          moduleId++;
          const nextFilename = path.resolve(path.dirname(entry), modulePath.value);
          // 更改该模块的值
          // 比如: require('lodash') => require(3)
          modulePath.value = moduleId;
          // 解析这个模块，同时加到当前模块的deps中
          deps.push(buildModules(nextFilename));
        }
      }
    }
  })

  return {
    filename: entry,
    deps,
    code: generate(ast).code,
    id: currentModuleId
  }
}

/**
 * 将模块树扁平化
 * 把模块依赖由树结构更改为数组结构，方便更快的索引
 * {
 *    id: 0,
 *    filename: A,
 *    deps: [
 *      { id: 1, filename: B, deps: [] },
 *      { id: 2, filename: C, deps: [] },
 *    ]
 *  }
 * ====> 该函数把数据结构由以上转为以下
 *  [
 *    { id: 0, filename: A }
 *    { id: 1, filename: B }
 *    { id: 2, filename: C }
 *  ]
 * @param {any} moduleTree 模块树
 */
function TreeToQueue(moduleTree) {
  const { deps, ...module } = moduleTree;

  const moduleQueue = deps.reduce((prev, cur) => {
    return prev.concat(TreeToQueue(cur))
  }, [module])

  return moduleQueue;
}

/**
 * 生成模块包裹块
 * @param {string} codeContent 代码内容
 * @returns 
 */
function createModuleWrapper(codeContent) {
  // 运行时，三个参数传入的就是targetModule.exports, webpack_require, targetModule
  return `(exports, require, module) => {
    // 比如：该代码中包含module.export = xxx,那么在运行时其实是 targetModule.exports = xxx;
    // 这样就可以拿到该模块执行的结果，然后缓存起来。
    ${codeContent}
  }`
}

/**
 * output内容模板
 * 1. 构建webpack_modules
 * 2. 构建webpack_require，加载模块，模拟Commonjs中require
 * 3. 运行入口函数
 * @param {string} entry 入口文件路径 
 */
function createBundleTemplate(entry) {
  const rawModules = TreeToQueue(buildModules(entry));

  const requireFuncContent = `
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
  `
  return `
  // 使用块作用域，避免污染全局变量
  {
    // 模块数组
    const webpack_modules = [
      ${rawModules.map(m => createModuleWrapper(m.code))}
    ];
    // 模块缓存
    const cache_webpack_modules = {};

    // 模块请求函数
    ${requireFuncContent}

    // 请求入口模块
    webpack_require(0);
  }
  `
}

module.exports = createBundleTemplate
