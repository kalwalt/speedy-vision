/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for the web
 * Copyright 2020 Alexandre Martins <alemartf(at)gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * identity.js
 * Identity shader
 */

// Identity shader: no-operation
export const identity = (image) => `
uniform sampler2D image;

void main()
{
    color = currentPixel(image);
}
`;

// Flip y-axis for output
export const flipY = (image) => `
uniform sampler2D image;

void main() {
    ivec2 pos = threadLocation();
    pos.y = int(texSize.y) - 1 - pos.y;

    color = pixelAt(image, pos);
}
`;