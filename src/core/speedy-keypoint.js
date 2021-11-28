/*
 * speedy-vision.js
 * GPU-accelerated Computer Vision for JavaScript
 * Copyright 2020-2021 Alexandre Martins <alemartf(at)gmail.com>
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
 * speedy-keypoint.js
 * Keypoint class
 */

import { SpeedyKeypointDescriptor } from './speedy-keypoint-descriptor';
import { SpeedyPoint2 } from './speedy-point';

/**
 * Represents a keypoint
 */
export class SpeedyKeypoint
{
    /**
     * Constructor
     * @param {number} x X position
     * @param {number} y Y position
     * @param {number} [lod] Level-of-detail
     * @param {number} [rotation] Rotation in radians
     * @param {number} [score] Cornerness measure
     * @param {SpeedyKeypointDescriptor|null} [descriptor] Keypoint descriptor, if any
     */
    constructor(x, y, lod = 0.0, rotation = 0.0, score = 0.0, descriptor = null)
    {
        /** @type {SpeedyPoint2} keypoint position */
        this._position = new SpeedyPoint2(+x, +y);

        /** @type {number} level of detail */
        this._lod = +lod;

        /** @type {number} rotation in radians */
        this._rotation = +rotation;

        /** @type {number} a cornerness measure */
        this._score = +score;

        /** @type {SpeedyKeypointDescriptor|null} keypoint descriptor, if any */
        this._descriptor = descriptor;
    }

    /**
     * Converts this keypoint to a descriptive string
     * @returns {string}
     */
    toString()
    {
        return `SpeedyKeypoint(${this.x},${this.y})`;
    }

    /**
     * The position of this keypoint
     * @returns {SpeedyPoint2}
     */
    get position()
    {
        return this._position;
    }

    /**
     * The x-position of this keypoint
     * @returns {number}
     */
    get x()
    {
        return this._position.x;
    }

    /**
     * The y-position of this keypoint
     * @returns {number}
     */
    get y()
    {
        return this._position.y;
    }

    /**
     * The pyramid level-of-detail from which this keypoint was extracted
     * @returns {number}
     */
    get lod()
    {
        return this._lod;
    }

    /**
     * Scale: 2^lod
     * @returns {number}
     */
    get scale()
    {
        return Math.pow(2, this._lod);
    }

    /**
     * The orientation of the keypoint, in radians
     * @returns {number} Angle in radians
     */
    get rotation()
    {
        return this._rotation;
    }

    /**
     * Score: a cornerness measure
     * @returns {number} Score
     */
    get score()
    {
        return this._score;
    }

    /**
     * Keypoint descriptor
     * @return {SpeedyKeypointDescriptor|null}
     */
    get descriptor()
    {
        return this._descriptor;
    }
}