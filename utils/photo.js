function mime(path) {
  const extension = String(path).split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase()
  return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'gif' ? 'image/gif' : 'image/jpeg'
}
export async function imageDataUrl(path) {
  if (!path) return ''
  if (path.startsWith('data:image/')) return path
  if (typeof plus !== 'undefined' && plus.io) {
    const localPath=path.startsWith('/static/')?`_www${path}`:path
    return new Promise((resolve,reject)=>{
      let settled=false
      const timer=setTimeout(()=>finish(new Error('照片读取超时，请重新选择图片')),15000)
      function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)}
      plus.io.resolveLocalFileSystemURL(localPath,entry=>entry.file(file=>{
        if(file.size>2.5*1024*1024)return finish(new Error('图片超过 2.5 MB，请压缩后重试'))
        try{const reader=new plus.io.FileReader();reader.onloadend=event=>{const value=event.target.result;if(typeof value!=='string'||!value.startsWith('data:image/'))return finish(new Error('照片读取失败，请重新选择图片'));finish(null,value)};reader.onerror=()=>finish(new Error('照片读取失败'));reader.readAsDataURL(file)}catch{finish(new Error('照片读取失败'))}
      },()=>finish(new Error('照片文件已失效，请重新选择图片'))),()=>finish(new Error('无法读取物品照片，请重新选择图片')))
    })
  }
  if (typeof window !== 'undefined') {
    const response = await fetch(new URL(path, window.location.href).href)
    if (!response.ok) throw new Error('无法读取物品照片，请重新选择图片')
    const blob = await response.blob()
    if (blob.size > 2.5 * 1024 * 1024) throw new Error('图片超过 2.5 MB，请压缩后重试')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('照片读取失败'))
      reader.readAsDataURL(blob)
    })
  }
  if (typeof uni.getFileSystemManager === 'function') {
    return new Promise((resolve, reject) => uni.getFileSystemManager().readFile({
      filePath: path, encoding: 'base64',
      success: result => resolve(`data:${mime(path)};base64,${result.data}`),
      fail: () => reject(new Error('无法读取物品照片'))
    }))
  }
  throw new Error('当前设备暂不支持读取照片')
}
