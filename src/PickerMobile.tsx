import React, { Component, HTMLAttributes, ReactNode } from "react"
import classNames from "classnames"

export interface PickerItem<T extends string> {
	value: T
	children?: ReactNode
	title: string
}
interface PickerProps<T extends string> extends HTMLAttributes<HTMLDivElement> {
	value: T
	onchange: (value: T) => void
	items: PickerItem<T>[]
	id: string
	title: string
}
class PickerMobileState {
	open = false
}
export class PickerMobile<T extends string> extends Component<PickerProps<T>, PickerMobileState> {
	constructor(props: PickerProps<T>) {
		super(props)
		this.state = new PickerMobileState()
	}
	setState(x) {
		super.setState(x)
		console.log(x)
	}
	public render(): any {
		const { value, title, items, id, onchange, style, className, ...htmlAttributes } = this.props
		const selected = items.find(i => i.value == value)
		console.log("render")

		return (
			<div
				{...htmlAttributes}
				style={{ ...style, height: "auto" }}
				className={classNames(className, "picker-mobile", this.state.open ? "open" : "closed")}
				onClick={
					!this.state.open &&
					(e => {
						console.log("div.picker-mobile onClick", e)
						this.setState({ open: true })
						console.log("div.picker-mobile onClick2", e)
						e.preventDefault()
					})
				}
				id={id}
			>
				<div className="title">{title}</div>
				{(this.state.open ? items : [selected]).map(({ value: itemValue, title, children }) => (
					<label className={classNames("picker-option", itemValue === value && "selected")} key={itemValue}>
						<div className="title">
							<input
								type="radio"
								value={itemValue}
								name={id}
								checked={itemValue == value}
								onClick={
									this.state.open &&
									(e => {
										console.log("input onClick", e)
										this.setState({ open: false })
										console.log("input onClick2", e)
										console.log("onchange", (e.target as HTMLInputElement).value),
											onchange((e.target as HTMLInputElement).value as any)
									})
								}
							/>{" "}
							{title}
						</div>
						{children}
					</label>
				))}
			</div>
		)
	}
}
