import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import './ImageCropper.css';

interface ImageCropperProps {
  visible: boolean;
  imageUri: string | null;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmButtonColor?: string;
  confirmTextColor?: string;
  cancelButtonColor?: string;
  cancelTextColor?: string;
  onCancel: () => void;
  onConfirm: (croppedImage: string) => void | Promise<void>;
}

export default function ImageCropper({
  visible,
  imageUri,
  title = '画像をトリミング',
  confirmLabel = '切り抜き',
  cancelLabel = 'キャンセル',
  confirmButtonColor = '#3B82F6',
  confirmTextColor = '#ffffff',
  cancelButtonColor = '#e0e0e0',
  cancelTextColor = '#333333',
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const [zoom, setZoom] = useState(1);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (visible) {
      setZoom(1);
      setDragPos({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [visible, imageUri]);

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - dragPos.x, y: clientY - dragPos.y });
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setDragPos({ x: clientX - dragStart.x, y: clientY - dragStart.y });
  };

  const handleEnd = () => setIsDragging(false);

  const executeCrop = async () => {
    if (!imageUri) return;

    if (typeof document === 'undefined') {
      await onConfirm(imageUri);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const img = document.createElement('img');
    img.src = imageUri;
    img.onload = async () => {
      ctx.clearRect(0, 0, 320, 320);
      const baseWidth = 200;
      const finalScale = 320 / baseWidth;

      ctx.save();
      ctx.translate(160, 160);
      ctx.translate(dragPos.x * finalScale, dragPos.y * finalScale);
      ctx.scale(zoom * finalScale, zoom * finalScale);

      const displayWidth = baseWidth;
      const displayHeight = (img.height / img.width) * displayWidth;

      ctx.drawImage(img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
      ctx.restore();

      await onConfirm(canvas.toDataURL('image/jpeg', 0.85));
    };
  };

  if (!visible || !imageUri) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>

        <View
          style={styles.cropPreview}
          onMouseDown={(event) => handleStart(event.clientX, event.clientY)}
          onMouseMove={(event) => handleMove(event.clientX, event.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(event) => handleStart(event.touches[0].clientX, event.touches[0].clientY)}
          onTouchMove={(event) => handleMove(event.touches[0].clientX, event.touches[0].clientY)}
          onTouchEnd={handleEnd}
        >
          <Image
            source={{ uri: imageUri }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 200,
              height: '100%',
              transform: `translate(-50%, -50%) translate(${dragPos.x}px, ${dragPos.y}px) scale(${zoom})`,
            }}
            alt=""
          />
        </View>

        <View style={styles.sliderWrap}>
          <Text style={styles.sliderLabel}>ズーム: {zoom.toFixed(1)}x</Text>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={zoom}
            onChange={(event) => setZoom(parseFloat(event.target.value))}
            className="crop-range"
            aria-label="ズームレベル"
            title="ズーム"
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, { backgroundColor: cancelButtonColor }]} onPress={onCancel}>
            <Text style={[styles.actionText, { color: cancelTextColor }]}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: confirmButtonColor }]} onPress={executeCrop}>
            <Text style={[styles.actionText, { color: confirmTextColor }]}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 320,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  cropPreview: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 0,
    elevation: 0,
  },
  sliderWrap: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontWeight: '700',
  },
});
