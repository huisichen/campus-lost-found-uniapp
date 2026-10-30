import assert from 'node:assert/strict'
import {imageDataUrl} from '../utils/photo.js'
globalThis.plus={io:{resolveLocalFileSystemURL(_path,_ok,fail){fail()}}}
await assert.rejects(imageDataUrl('missing-photo.jpg'),/无法读取/)
globalThis.plus.io.resolveLocalFileSystemURL=(_path,ok)=>ok({file(_ok,fail){fail()}})
await assert.rejects(imageDataUrl('expired-photo.jpg'),/已失效/)
globalThis.plus.io.resolveLocalFileSystemURL=(_path,ok)=>ok({file(ok){ok({size:10})}})
globalThis.plus.io.FileReader=class {readAsDataURL(){this.onerror()}}
await assert.rejects(imageDataUrl('unreadable-photo.jpg'),/照片读取失败/)
delete globalThis.plus
console.log('通过：原生照片路径失效、文件失效与读取失败均可结束等待并报错')
