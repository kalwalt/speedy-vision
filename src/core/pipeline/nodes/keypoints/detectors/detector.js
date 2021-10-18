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
 * detector.js
 * Abstract keypoint detectors
 */

import { SpeedyPipelineNode } from '../../../pipeline-node';
import { SpeedyPipelineMessageType, SpeedyPipelineMessageWithKeypoints } from '../../../pipeline-message';
import { SpeedyPipelinePortBuilder } from '../../../pipeline-portbuilder';
import { SpeedyGPU } from '../../../../../gpu/speedy-gpu';
import { SpeedyTexture, SpeedyDrawableTexture } from '../../../../../gpu/speedy-texture';
import { Utils } from '../../../../../utils/utils';
import { SpeedyPromise } from '../../../../../utils/speedy-promise';
import { MIN_KEYPOINT_SIZE, MIN_ENCODER_LENGTH, MAX_ENCODER_CAPACITY } from '../../../../../utils/globals';

// Constants
const ENCODER_PASSES = 4; // number of passes of the keypoint encoder: directly impacts performance
const LONG_SKIP_OFFSET_PASSES = 2; // number of passes of the long skip offsets shader
const MAX_CAPACITY = MAX_ENCODER_CAPACITY; // maximum capacity of the encoder (up to this many keypoints can be stored)
const DEFAULT_CAPACITY = 2048; // default capacity of the encoder (64x64 texture with 2 pixels per keypoint)
const DEFAULT_SCALE_FACTOR = 1.4142135623730951; // sqrt(2)
const NUMBER_OF_INTERNAL_TEXTURES = 5; // number of internal textures used to encode the keypoints

/**
 * Abstract keypoint detector
 * @abstract
 */
export class SpeedyPipelineNodeKeypointDetector extends SpeedyPipelineNode
{
    /**
     * Constructor
     * @param {string} [name] name of the node
     * @param {number} [texCount] number of work textures
     * @param {SpeedyPipelinePortBuilder[]} [portBuilders] port builders
     */
    constructor(name = undefined, texCount = 0, portBuilders = undefined)
    {
        super(name, texCount + NUMBER_OF_INTERNAL_TEXTURES, portBuilders);

        /** @type {number} encoder capacity */
        this._capacity = DEFAULT_CAPACITY; // must not be greater than MAX_ENCODER_CAPACITY

        /** @type {GLint} auxiliary storage */
        this._oldWrapS = 0;
    }

    /**
     * Initialize this node
     * @param {SpeedyGPU} gpu
     */
    init(gpu)
    {
        // initialize
        super.init(gpu);

        // encodeKeypointSkipOffsets() relies on this
        this._oldWrapS = this._setupSpecialTexture(gpu.gl.TEXTURE_WRAP_S, gpu.gl.REPEAT);
    }

    /**
     * Release this node
     * @param {SpeedyGPU} gpu
     */
    release(gpu)
    {
        // we need to restore the texture parameter because textures come from a pool!
        this._setupSpecialTexture(gpu.gl.TEXTURE_WRAP_S, this._oldWrapS);

        // release
        super.release(gpu);
    }

    /**
     * Set a parameter of the special texture
     * @param {GLenum} pname
     * @param {GLint} param new value
     * @returns {GLint} old value of param
     */
    _setupSpecialTexture(pname, param)
    {
        const texture = this._tex[this._tex.length - 1];
        const gl = texture.gl;

        gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
        const oldval = gl.getTexParameter(gl.TEXTURE_2D, pname);
        gl.texParameteri(gl.TEXTURE_2D, pname, param);
        gl.bindTexture(gl.TEXTURE_2D, null);

        return oldval;
    }

    /**
     * We can encode up to this many keypoints. If you find a
     * tight bound for this, download times will be faster.
     * @returns {number}
     */
    get capacity()
    {
        return this._capacity;
    }

    /**
     * We can encode up to this many keypoints. If you find a
     * tight bound for this, download times will be faster.
     * @param {number} capacity
     */
    set capacity(capacity)
    {
        this._capacity = Math.min(Math.max(0, capacity | 0), MAX_CAPACITY);
    }

    /**
     * Create a tiny texture with encoded keypoints out of
     * an encoded corners texture
     * @param {SpeedyGPU} gpu
     * @param {SpeedyTexture} corners input
     * @param {SpeedyDrawableTexture} encodedKeypoints output
     * @param {number} [descriptorSize] in bytes
     * @param {number} [extraSize] in bytes
     * @returns {SpeedyDrawableTexture} encodedKeypoints
     */
    _encodeKeypoints(gpu, corners, encodedKeypoints, descriptorSize = 0, extraSize = 0)
    {
        const capacity = this._capacity;
        const encoderLength = SpeedyPipelineNodeKeypointDetector.encoderLength(capacity, descriptorSize, extraSize);
        const width = corners.width, height = corners.height;
        const imageSize = [ width, height ];
        const tex = this._tex.slice(this._tex.length - NUMBER_OF_INTERNAL_TEXTURES); // array of internal textures
        const keypoints = gpu.programs.keypoints;
        const specialTexture = tex.pop(); // gl.TEXTURE_WRAP_S is set to gl.REPEAT

        // prepare programs
        keypoints.encodeKeypointSkipOffsets.outputs(width, height, tex[0]);
        keypoints.encodeKeypointLongSkipOffsets.outputs(width, height, tex[1], tex[0]);
        keypoints.encodeKeypointPositions.outputs(encoderLength, encoderLength, tex[2], tex[3]);
        keypoints.encodeKeypointProperties.outputs(encoderLength, encoderLength, encodedKeypoints);

        // copy the input corners to a special texture
        // that is needed by encodeKeypointSkipOffsets()
        corners = (gpu.programs.utils.identity
            .outputs(width, height, specialTexture)
        )(corners);

        // encode skip offsets
        let offsets = keypoints.encodeKeypointSkipOffsets(corners, imageSize);
        for(let i = 0; i < LONG_SKIP_OFFSET_PASSES; i++) { // to boost performance
            // the maximum skip offset of pass p=1,2,3... is 7 * (1+m)^p,
            // where m = MAX_ITERATIONS of encodeKeypointLongSkipOffsets()
            offsets = keypoints.encodeKeypointLongSkipOffsets(offsets, imageSize); // **bottleneck**
        }

        /*
        // debug: view corners
        let cornerview = offsets;
        const canvas = gpu.renderToCanvas(cornerview);
        if(!window._ww) document.body.appendChild(canvas);
        window._ww = 1;
        */

        // encode keypoint positions
        let encodedKps = tex[3].clear();
        for(let j = 0; j < ENCODER_PASSES; j++)
            encodedKps = keypoints.encodeKeypointPositions(offsets, imageSize, j, ENCODER_PASSES, capacity, encodedKps, descriptorSize, extraSize, encoderLength);

        // encode keypoint properties
        return keypoints.encodeKeypointProperties(corners, encodedKps, descriptorSize, extraSize, encoderLength);
    }

    _encodeKeypoints2(gpu, corners, encodedKeypoints, descriptorSize = 0, extraSize = 0)
    {
        const capacity = this._capacity;
        const encoderLength = SpeedyPipelineNodeKeypointDetector.encoderLength(capacity, descriptorSize, extraSize);
        const width = corners.width, height = corners.height;
        const tex = this._tex.slice(this._tex.length - NUMBER_OF_INTERNAL_TEXTURES); // array of internal textures
        const keypoints = gpu.programs.keypoints;

        // pad textures to a power of two
        const exp2 = Math.ceil(Math.log2(width * height));
        const paddedWidth = 1 << (exp2 >>> 1);
        const paddedHeight = 1 << ((exp2 >>> 1) + (exp2 & 1));
        keypoints.initLookupOfLocations.outputs(paddedWidth, paddedHeight, tex[1]);
        keypoints.computeLookupOfLocations.outputs(paddedWidth, paddedHeight, tex[0], tex[1]);
        keypoints.initSumTable.outputs(paddedWidth, paddedHeight, tex[3]);
        keypoints.computeSumTable.outputs(paddedWidth, paddedHeight, tex[2], tex[3]);

        // compute lookup table
        const stride = paddedWidth;
        let sumTable = keypoints.initSumTable(corners, stride);
        let lookupTable = keypoints.initLookupOfLocations(corners, stride);

        const npasses = exp2; // = log2(paddedWidth * paddedHeight)
        for(let i = 0; i < npasses; i++) {
            const prevSumTable = sumTable;
            const blockSize = 1 << i;
            sumTable = keypoints.computeSumTable(prevSumTable, blockSize, 2 * blockSize, stride);
            lookupTable = keypoints.computeLookupOfLocations(lookupTable, sumTable, prevSumTable, blockSize, 2 * blockSize, stride);
        }

        /*
        // debug: view lookup table
        const canvas = gpu.renderToCanvas(lookupTable);
        if(!window._ww) document.body.appendChild(canvas);
        window._ww = 1;
        */

        // encode keypoints
        return encodedKeypoints.resize(encoderLength, encoderLength).clear(1,1,1,1);
    }



    /**
     * Create a tiny texture with zero encoded keypoints
     * @param {SpeedyGPU} gpu
     * @param {SpeedyDrawableTexture} encodedKeypoints output texture
     * @param {number} [descriptorSize] in bytes
     * @param {number} [extraSize] in bytes
     * @returns {SpeedyDrawableTexture} encodedKeypoints
     */
    _encodeZeroKeypoints(gpu, encodedKeypoints, descriptorSize = 0, extraSize = 0)
    {
        const capacity = 0;
        const encoderLength = SpeedyPipelineNodeKeypointDetector.encoderLength(capacity, descriptorSize, extraSize);
        const keypoints = gpu.programs.keypoints;

        keypoints.encodeNullKeypoints.outputs(encoderLength, encoderLength, encodedKeypoints);
        keypoints.encodeNullKeypoints();

        return encodedKeypoints;
    }

    /**
     * Compute the length of the keypoint encoder, given its capacity
     * @param {number} encoderCapacity how many keypoints can we fit?
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     */
    static encoderLength(encoderCapacity, descriptorSize, extraSize)
    {
        const pixelsPerKeypoint = Math.ceil((MIN_KEYPOINT_SIZE + descriptorSize + extraSize) / 4);
        const numberOfPixels = encoderCapacity * pixelsPerKeypoint;

        return Math.max(MIN_ENCODER_LENGTH, Math.ceil(Math.sqrt(numberOfPixels)));
    }

    /**
     * The maximum number of keypoints we can store using
     * a particular configuration of a keypoint encoder
     * @param {number} descriptorSize in bytes
     * @param {number} extraSize in bytes
     * @param {number} encoderLength
     */
    static encoderCapacity(descriptorSize, extraSize, encoderLength)
    {
        const pixelsPerKeypoint = Math.ceil((MIN_KEYPOINT_SIZE + descriptorSize + extraSize) / 4);
        const numberOfPixels = encoderLength * encoderLength;

        return Math.floor(numberOfPixels / pixelsPerKeypoint);
    }
}

/**
 * Abstract scale-space keypoint detector
 * @abstract
 */
export class SpeedyPipelineNodeMultiscaleKeypointDetector extends SpeedyPipelineNodeKeypointDetector
{
    /**
     * Constructor
     * @param {string} [name] name of the node
     * @param {number} [texCount] number of work textures
     * @param {SpeedyPipelinePortBuilder[]} [portBuilders] port builders
     */
    constructor(name = undefined, texCount = undefined, portBuilders = undefined)
    {
        super(name, texCount, portBuilders);

        /** @type {number} number of pyramid levels */
        this._levels = 1;

        /** @type {number} scale factor between two pyramid levels */
        this._scaleFactor = DEFAULT_SCALE_FACTOR;
    }

    /**
     * Number of pyramid levels
     * @returns {number}
     */
    get levels()
    {
        return this._levels;
    }

    /**
     * Number of pyramid levels
     * @param {number} levels
     */
    set levels(levels)
    {
        this._levels = Math.max(1, levels | 0);
    }

    /**
     * Scale factor between two pyramid levels
     * @returns {number}
     */
    get scaleFactor()
    {
        return this._scaleFactor;
    }

    /**
     * Scale factor between two pyramid levels
     * @param {number} scaleFactor should be greater than 1
     */
    set scaleFactor(scaleFactor)
    {
        this._scaleFactor = Math.max(1.0, Math.min(+scaleFactor, 2.0));
    }
}