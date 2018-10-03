import React, { Component, HTMLAttributes, MouseEvent } from "react"
import { TSGLContext, Mesh, Shader } from "tsgl"
import { V3, V, M4, DEG, assertNever, lerp, int, Matrix, Tuple3 } from "ts3dutils"
import posVS from "tsgl/src/shaders/posVS.glslx"
import memoize from "lodash.memoize"
import colorFS from "tsgl/src/shaders/colorFS.glslx"

// @ts-ignore
import posNormalColorVS from "./interpolationVS.glslx"
import varyingColorFS from "tsgl/src/shaders/varyingColorFS.glslx"
import chroma, { ColorMode } from "chroma.ts"
import { colorSpaces, DrawableColorSpaces } from "./colorSpaces"
import { extendedColors } from "./extendedColors"

const ANIMATION_DURATION = 2000
type Color = chroma.Color
type X = Color & { displayColor?: Color }

class SpacesCanvasState {
	public animationEnd: int = 0
}
function distanceLinePoint(anchor: V3, dir: V3, x: V3) {
	// See http://mathworld.wolfram.com/Point-LineDistance3-Dimensional.html
	const dir1 = dir.unit()
	const t = x.minus(anchor).dot(dir1)
	return dir1
		.times(t)
		.plus(anchor)
		.distanceTo(x)

	//return x.minus(this.anchor).cross(x.minus(this.anchor.plus(this.dir1))).length()
}
export class Camera {
	public readonly eye: V3 = V(1, -2.5, 1)
	public readonly center: V3 = V(0, 0, 0.5)
	public readonly up: V3 = V3.Z
}
export type What = keyof typeof whats
interface SpacesCanvasProps extends HTMLAttributes<HTMLCanvasElement> {
	colorSpace: DrawableColorSpaces
	what: What
	rotation: boolean
	onHoverChange: (value: Color | undefined) => void
	colorHighlight: Color | undefined
	pointerColorMaxDistance?: number

	camera: Camera
}
export class SpacesCanvas extends Component<SpacesCanvasProps, SpacesCanvasState> {
	public canvas!: HTMLCanvasElement
	public gl!: TSGLContext
	public colorPointsMesh!: Mesh

	public interpolationAnimation: int = 0

	public getColorsForWhat = memoize(function(what: What) {
		return whats[what]()
	})
	public colorPoss: V3[] = []
	public colorPossPrev: V3[] = this.colorPoss
	public highlightIndex: int = -1

	public state = new SpacesCanvasState()
	public colorPointMesh!: Mesh & { normals: any[]; TRIANGLES: number[]; LINES: number[] }
	protected createMeshForWhat = memoize(
		function(this: SpacesCanvas, what: What, colorSpace: DrawableColorSpaces) {
			return this.createMeshFromColors(this.getColorsForWhat(what), colorSpace)
		},
		(what, colorSpace) => what + " " + colorSpace,
	)
	private rotationTime: int = 0
	private hoverColor: Color | undefined

	public render() {
		const {
			colorSpace,
			onHoverChange,
			what,
			colorHighlight,
			rotation,
			pointerColorMaxDistance,
			...htmlAttributes
		} = this.props
		return <canvas {...htmlAttributes} ref={r => (this.canvas = r!)} onMouseMove={this.onMouseMove} />
	}

	public windowOnResize = () => {
		this.gl.fixCanvasRes(2)
		this.forceUpdate()
	}

	public onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
		const { anchor, dir } = this.gl.getMouseLine(e.nativeEvent)
		const t = this.colorPoss
			.map((p, i) => [p, i] as [V3, int])
			.filter(([p, _i]) => distanceLinePoint(anchor, dir, p) < (this.props.pointerColorMaxDistance || 0.01))
			.withMax(([p, _i]) => -p.minus(anchor).dot(dir.unit()))
		const newHoverIndex = t ? t[1] : -1
		const newHoverColor = this.getColorsForWhat(this.props.what)[newHoverIndex]
		if (newHoverColor != this.hoverColor) {
			this.hoverColor = newHoverColor
			this.props.onHoverChange(newHoverColor)
		}

		if (this.props.onMouseMove) {
			this.props.onMouseMove(e)
		}
	}

	public async componentDidMount() {
		const gl = (this.gl = TSGLContext.create({ canvas: this.canvas }))
		gl.fixCanvasRes(2)
		gl.meshes = {
			cube: Mesh.cube().compile(),
		}
		gl.shaders = {}
		// this.colorPointMesh = Mesh.cube()
		// 	.scale(2)
		// 	.translate(-1, -1, -1)
		// 	.compile()
		this.colorPointMesh = Mesh.sphere(1)
		gl.shaders.singleColor = Shader.create(posVS, colorFS)
		gl.shaders.varyingColor = Shader.create(posNormalColorVS, varyingColorFS)

		gl.clearColor(0.8, 0.8, 0.8, 1)
		gl.enable(gl.DEPTH_TEST)
		gl.enable(gl.CULL_FACE)

		gl.getExtension("OES_element_index_uint")

		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE)
		gl.enable(gl.BLEND)

		await gl.setupTextRendering("OpenSans-Regular.png", "OpenSans-Regular.json")

		this.componentDidUpdate({} as any)
		// gl.animate((t, dt) => this.renderCanvas(t, dt))

		window.addEventListener("resize", this.windowOnResize)
	}

	public componentDidUpdate(prevProps: Readonly<SpacesCanvasProps>) {
		// console.time()
		if (prevProps.colorSpace != this.props.colorSpace || prevProps.what != this.props.what) {
			const newMesh = this.createMeshForWhat(this.props.what, this.props.colorSpace)
			if (this.colorPointsMesh && prevProps.what == this.props.what) {
				newMesh.vertexBuffers.ts_Vertex2 = this.colorPointsMesh.vertexBuffers.ts_Vertex
				this.setState({ animationEnd: performance.now() + ANIMATION_DURATION })
			} else {
				newMesh.vertexBuffers.ts_Vertex2 = newMesh.vertexBuffers.ts_Vertex
			}
			this.colorPointsMesh = newMesh

			this.colorPossPrev = this.colorPoss
			this.colorPoss = this.getColorsForWhat(this.props.what).map(colorSpaces[this.props.colorSpace].convert)
		}
		if (prevProps.what != this.props.what || prevProps.colorHighlight != this.props.colorHighlight) {
			this.highlightIndex =
				undefined == this.props.colorHighlight
					? -1
					: this.getColorsForWhat(this.props.what).findIndex(color =>
							color.equals(this.props.colorHighlight!),
					  )
		}
		// console.timeEnd()
		requestAnimationFrame(this.renderCanvas)
	}

	public componentWillUnmount() {
		window.removeEventListener("resize", this.windowOnResize)
	}

	protected renderCanvas = (_t: number) => {
		const { gl } = this
		const { eye, center, up } = this.props.camera
		// if (this.props.rotation) {
		// 	this.rotationTime += dt
		// }
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		gl.cullFace(gl.BACK)

		gl.matrixMode(gl.PROJECTION)
		gl.loadIdentity()
		// gl.perspective(15, gl.canvas.width / gl.canvas.height, 0.1, 1000)
		const ratio = gl.canvas.width / gl.canvas.height
		const lr = Math.max(ratio, 1) * 0.7
		const bt = lr / ratio
		gl.ortho(-lr, lr, -bt, bt, -1e4, 1e4)
		gl.lookAt(eye, center, up)

		gl.matrixMode(gl.MODELVIEW)
		gl.loadIdentity()

		// // cube
		// gl.pushMatrix()
		// gl.translate(-0.5, -0.5, 0)
		// gl.shaders.singleColor.uniforms({ color: chroma("black").gl() }).draw(gl.meshes.cube, gl.LINES)
		// gl.popMatrix()

		// gl.rotate((this.rotationTime / 1000) * 10, 0, 0, 1)
		gl.pushMatrix()
		gl.disable(gl.CULL_FACE)
		colorSpaces[this.props.colorSpace].render(gl)
		gl.enable(gl.CULL_FACE)
		gl.popMatrix()
		let f = 0
		if (_t < this.state.animationEnd) {
			f = (this.state.animationEnd - _t) / ANIMATION_DURATION
			requestAnimationFrame(this.renderCanvas)
		}
		gl.shaders.varyingColor.uniforms({ f }).draw(this.colorPointsMesh)
		if (-1 !== this.highlightIndex) {
			gl.cullFace(gl.FRONT)
			const pos =
				0 == f
					? this.colorPoss[this.highlightIndex]
					: this.colorPoss[this.highlightIndex].lerp(this.colorPossPrev[this.highlightIndex], f)
			gl.translate(pos)
			gl.scale(0.01 * 1.8)
			gl.shaders.singleColor
				.uniforms({
					color: this.props.colorHighlight!.textColor().gl(),
				})
				.draw(this.colorPointMesh)
		}
	}
	protected createMeshFromColors(colors: X[], colorSpace: DrawableColorSpaces) {
		const { colorPointMesh } = this
		const tempMatrix1 = new M4(),
			tempMatrix2 = new M4(),
			tempMatrix3 = new M4()
		const pointMeshes = colors.map(color => {
			const pos = colorSpaces[colorSpace].convert(color)
			const pointSize = 0.01
			const glColor = (color.displayColor || color).gl()
			const result = colorPointMesh
				.transform(M4.multiply(M4.translate(pos, tempMatrix2), M4.scale(pointSize, tempMatrix1), tempMatrix3))
				.addVertexBuffer("colors", "ts_Color")
			result.colors = fillArray(colorPointMesh.vertices.length, glColor)
			return result
		})
		return new Mesh()
			.addIndexBuffer("TRIANGLES", this.gl.UNSIGNED_INT)
			.addVertexBuffer("normals", "ts_Normal")
			.addVertexBuffer("colors", "ts_Color")
			.concat(...pointMeshes)
			.compile()
	}
}
export const whats = {
	hues() {
		return Array.from({ length: 180 }, (_, i) => chroma.hsl(i * 2, 1, 0.5))
	},
	rgbCube16() {
		return rgbCube(16)
	},
	w3cx11() {
		return Object.keys(chroma.w3cx11).map(x => chroma.color(x))
	},
	_50shadesOfGrey() {
		return Array.from({ length: 52 }, (_, i) => chroma.hsl(0, 0, i / 51))
	},
	ks() {
		const result = []
		for (let i = 1000; i <= 40000; i += 100) {
			result.push(chroma.kelvin(i))
		}
		return result
	},
	cubehelix() {
		return chroma.scale(chroma.cubehelix()).colors(100, false) as Color[]
	},
	scalePaired() {
		return chroma.scale("Paired").colors(100, false) as Color[]
	},
	hslCylinder() {
		const X = 5
		const Y = 10
		const R = 90
		const result = []
		for (let r = 0; r < R; r++) {
			for (let x = 0; x < X; x++) {
				for (let y = 0; y < Y; y++) {
					result.push(chroma.hsl((r / R) * 360, x / (X - 1), lerp(0.01, 0.99, y / (Y - 1))))
				}
				// result.push(chroma.hsl((r / R) * 360, x / X, 0))
				// result.push(chroma.hsl((r / R) * 360, x / X, 1))
			}
		}
		return result
	},
	colors2() {
		return extendedColors.map(([hex, _name, _shade]) => {
			const c: X = chroma.color(hex) as X
			// c.displayColor = chroma(shade.toLowerCase())
			// c.displayColor = chroma(c.shade())
			return c
		})
	},
	l05() {
		const outerRingCount = 120
		const X = Math.round(outerRingCount / (2 * Math.PI))
		const result = []
		for (let x = 0; x < X; x++) {
			const s = x / (X - 1)
			const count = Math.round(s * outerRingCount)
			for (let r = 0; r < count; r++) {
				result.push(chroma.hsl((r / count) * 360, s, 0.5))
			}
		}
		// const X = 50
		// const R = 90
		// const result = []
		// for (let r = 0; r < R; r++) {
		// 	for (let x = 0; x < X; x++) {
		// 		const a = (x + r / 2) / 100
		// 		const b = (r * Math.sqrt(3)) / 2
		// 		const p = V(a, b)
		// 		result.push(chroma.hsl((r / R) * 360, x / (X - 1), 0.5))
		// 	}
		// }
		return result
	},
}
function rgbCube(r = 16) {
	return Mesh.box(r, r, r).vertices.map(({ x, y, z }) => chroma.gl(x, y, z, 1))
}

function fillArray(length: int, value: {}) {
	const result = new Array(length)
	let i = length
	while (i--) {
		result[i] = value
	}
	return result
}
