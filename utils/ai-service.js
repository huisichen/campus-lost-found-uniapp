/**
 * 真正的图像识别需要独立部署的后端服务；前端不保留人工智能服务密钥。
 * 目前由界面提供入口，本模块只实现明确的未配置反馈。
 */
export async function recognizeItemImage(localPhotoPath) {
  if (!localPhotoPath) throw new Error('请先选择物品照片')
  throw new Error('尚未连接图片识别服务，请先手动选择物品分类')
}
