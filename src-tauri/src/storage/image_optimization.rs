use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder};
use image::imageops::FilterType;
use image::{GenericImageView, ImageEncoder, ImageFormat};

use crate::models::ImageOptimizationMode;

const BALANCED_MAX_DIMENSION: u32 = 2560;
const BALANCED_JPEG_QUALITY: u8 = 92;
const COMPACT_MAX_DIMENSION: u32 = 1920;
const COMPACT_JPEG_QUALITY: u8 = 88;

pub fn optimize_image_bytes(
    bytes: &[u8],
    content_type: &str,
    mode: &ImageOptimizationMode,
) -> Option<Vec<u8>> {
    let (max_dimension, jpeg_quality) = optimization_profile(mode)?;
    let image_format = supported_image_format(content_type)?;
    let image = image::load_from_memory_with_format(bytes, image_format).ok()?;
    let (width, height) = image.dimensions();
    if width.max(height) <= max_dimension {
        return None;
    }

    // CatmullRom 在截图文字清晰度和首次打开耗时之间更均衡，避免 Lanczos3 让大 PNG 预览长时间占用 CPU。
    let resized = image.resize(max_dimension, max_dimension, FilterType::CatmullRom);
    encode_image(&resized, image_format, jpeg_quality)
}

fn optimization_profile(mode: &ImageOptimizationMode) -> Option<(u32, u8)> {
    match mode {
        ImageOptimizationMode::Original => None,
        ImageOptimizationMode::Balanced => Some((BALANCED_MAX_DIMENSION, BALANCED_JPEG_QUALITY)),
        ImageOptimizationMode::Compact => Some((COMPACT_MAX_DIMENSION, COMPACT_JPEG_QUALITY)),
    }
}

fn supported_image_format(content_type: &str) -> Option<ImageFormat> {
    match content_type
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "image/jpeg" => Some(ImageFormat::Jpeg),
        "image/png" => Some(ImageFormat::Png),
        "image/webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn encode_image(
    image: &image::DynamicImage,
    format: ImageFormat,
    jpeg_quality: u8,
) -> Option<Vec<u8>> {
    if format == ImageFormat::Jpeg {
        let mut output = Vec::new();
        JpegEncoder::new_with_quality(&mut output, jpeg_quality)
            .encode_image(image)
            .ok()?;
        return Some(output);
    }

    if format == ImageFormat::Png {
        let mut output = Vec::new();
        PngEncoder::new_with_quality(&mut output, CompressionType::Fast, PngFilterType::Adaptive)
            .write_image(
                image.as_bytes(),
                image.width(),
                image.height(),
                image.color().into(),
            )
            .ok()?;
        return Some(output);
    }

    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, format).ok()?;
    Some(output.into_inner())
}

#[cfg(test)]
mod tests {
    use super::optimize_image_bytes;
    use crate::models::ImageOptimizationMode;
    use image::{GenericImageView, ImageFormat};
    use std::io::Cursor;

    fn large_png() -> Vec<u8> {
        let image = image::DynamicImage::new_rgb8(3200, 1600);
        let mut output = Cursor::new(Vec::new());
        image.write_to(&mut output, ImageFormat::Png).unwrap();
        output.into_inner()
    }

    #[test]
    fn balanced_mode_limits_longest_dimension_to_2560() {
        let optimized =
            optimize_image_bytes(&large_png(), "image/png", &ImageOptimizationMode::Balanced)
                .unwrap();
        let image = image::load_from_memory_with_format(&optimized, ImageFormat::Png).unwrap();

        assert_eq!(image.dimensions(), (2560, 1280));
    }

    #[test]
    fn original_mode_keeps_image_untouched() {
        assert!(
            optimize_image_bytes(&large_png(), "image/png", &ImageOptimizationMode::Original,)
                .is_none()
        );
    }
}
