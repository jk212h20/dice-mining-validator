// OpenCV.js type declarations
declare global {
  interface Window {
    cv: typeof cv;
  }
  const cv: {
    Mat: new () => Mat;
    MatVector: new () => MatVector;
    Size: new (width: number, height: number) => Size;
    Point: new (x: number, y: number) => Point;
    Scalar: new (v0: number, v1?: number, v2?: number, v3?: number) => Scalar;
    Rect: new (x: number, y: number, width: number, height: number) => Rect;
    cvtColor: (src: Mat, dst: Mat, code: number) => void;
    inRange: (src: Mat, lowerb: Mat | Scalar, upperb: Mat | Scalar, dst: Mat) => void;
    threshold: (src: Mat, dst: Mat, thresh: number, maxval: number, type: number) => number;
    findContours: (image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number) => void;
    contourArea: (contour: Mat) => number;
    boundingRect: (contour: Mat) => Rect;
    minAreaRect: (points: Mat) => RotatedRect;
    drawContours: (image: Mat, contours: MatVector, contourIdx: number, color: Scalar, thickness: number) => void;
    circle: (img: Mat, center: Point, radius: number, color: Scalar, thickness: number) => void;
    rectangle: (img: Mat, pt1: Point | Rect, pt2: Point | Scalar, color: Scalar, thickness?: number) => void;
    GaussianBlur: (src: Mat, dst: Mat, ksize: Size, sigmaX: number) => void;
    morphologyEx: (src: Mat, dst: Mat, op: number, kernel: Mat) => void;
    getStructuringElement: (shape: number, ksize: Size) => Mat;
    dilate: (src: Mat, dst: Mat, kernel: Mat) => void;
    erode: (src: Mat, dst: Mat, kernel: Mat) => void;
    bitwise_and: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
    bitwise_or: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
    bitwise_not: (src: Mat, dst: Mat, mask?: Mat) => void;
    add: (src1: Mat, src2: Mat, dst: Mat) => void;
    mean: (src: Mat, mask?: Mat) => Scalar;
    split: (m: Mat, mv: MatVector) => void;
    merge: (mv: MatVector, dst: Mat) => void;
    matFromImageData: (imageData: ImageData) => Mat;
    COLOR_RGB2HSV: number;
    COLOR_BGR2HSV: number;
    COLOR_RGBA2RGB: number;
    COLOR_RGB2GRAY: number;
    COLOR_RGBA2GRAY: number;
    THRESH_BINARY: number;
    THRESH_BINARY_INV: number;
    THRESH_OTSU: number;
    RETR_EXTERNAL: number;
    RETR_LIST: number;
    RETR_TREE: number;
    CHAIN_APPROX_SIMPLE: number;
    CHAIN_APPROX_NONE: number;
    MORPH_OPEN: number;
    MORPH_CLOSE: number;
    MORPH_ELLIPSE: number;
    MORPH_RECT: number;
  };
}

interface Mat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  ucharPtr: (row: number, col: number) => Uint8Array;
  delete: () => void;
  clone: () => Mat;
  roi: (rect: Rect) => Mat;
  copyTo: (dst: Mat) => void;
  setTo: (scalar: Scalar) => void;
}

interface MatVector {
  size: () => number;
  get: (index: number) => Mat;
  push_back: (mat: Mat) => void;
  delete: () => void;
}

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Scalar {
  [index: number]: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RotatedRect {
  center: Point;
  size: Size;
  angle: number;
}

// Wait for OpenCV to be ready
export function waitForOpenCV(): Promise<void> {
  return new Promise((resolve) => {
    if (window.cv && window.cv.Mat) {
      resolve();
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.error('OpenCV.js failed to load');
    }, 30000);
  });
}

export function isOpenCVReady(): boolean {
  return !!(window.cv && window.cv.Mat);
}

export type { Mat, MatVector, Rect, Point, Scalar };
