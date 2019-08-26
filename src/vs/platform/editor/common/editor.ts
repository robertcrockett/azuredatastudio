/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';

export interface IEditorModel {

	/**
	 * Emitted when the model is disposed.
	 */
	readonly onDispose: Event<void>;

	/**
	 * Loads the model.
	 */
	load(): Promise<IEditorModel>;

	/**
	 * Dispose associated resources
	 */
	dispose(): void;
}

export interface IBaseResourceInput {

	/**
	 * Optional options to use when opening the text input.
	 */
	options?: ITextEditorOptions;

	/**
	 * Label to show for the diff editor
	 */
	readonly label?: string;

	/**
	 * Description to show for the diff editor
	 */
	readonly description?: string;

	/**
	 * Hint to indicate that this input should be treated as a file
	 * that opens in an editor capable of showing file content.
	 *
	 * Without this hint, the editor service will make a guess by
	 * looking at the scheme of the resource(s).
	 */
	readonly forceFile?: boolean;

	/**
	 * Hint to indicate that this input should be treated as a
	 * untitled file.
	 *
	 * Without this hint, the editor service will make a guess by
	 * looking at the scheme of the resource(s).
	 */
	readonly forceUntitled?: boolean;
}

export interface IResourceInput extends IBaseResourceInput {

	/**
	 * The resource URI of the resource to open.
	 */
	resource: URI;

	/**
	 * The encoding of the text input if known.
	 */
	readonly encoding?: string;

	/**
	 * The identifier of the language mode of the text input
	 * if known to use when displaying the contents.
	 */
	readonly mode?: string;
}

export interface IEditorOptions {

	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened.
	 *
	 * Will also not activate the group the editor opens in unless the group is already the active one.
	 * This behaviour can be overridden via the `forceActive` option.
	 */
	readonly preserveFocus?: boolean;

	/**
	 * This option is only relevant if an editor is opened into a group that is not active. In
	 * most cases opening an editor into an inactive group will cause it to become active. With
	 * `preserveActive: true` in combination with `preserveFocus: true` an editor can be opened
	 * while keeping the current group active.
	 *
	 * Other options like `preserveFocus`, `inactive` and `forceActive` can have an impact on
	 * whether a group gets activated or not.
	 *
	 * Note: `forceActive: true` will always win over `preserveActive: true`.
	 */
	readonly preserveActive?: boolean;

	/**
	 * This option is only relevant if an editor is opened into a group that is not active. In
	 * most cases opening an editor into an inactive group will cause it to become active. With
	 * `forceActive` the inactive group will become active independent of other options such as
	 * `preserveFocus` or `inactive`.
	 *
	 * Note: `forceActive: true` will always win over `preserveActive: true`.
	 */
	readonly forceActive?: boolean;

	/**
	 * Tells the editor to reload the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not reload the input if it is identical to the
	 * one showing.
	 */
	readonly forceReload?: boolean;

	/**
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	readonly revealIfVisible?: boolean;

	/**
	 * Will reveal the editor if it is already opened (even when not visible) in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	readonly revealIfOpened?: boolean;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	readonly pinned?: boolean;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	readonly index?: number;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background without loading its contents.
	 *
	 * Will also not activate the group the editor opens in unless the group is already the active one.
	 * This behaviour can be overridden via the `forceActive` option.
	 */
	readonly inactive?: boolean;

	/**
	 * Will not show an error in case opening the editor fails and thus allows to show a custom error
	 * message as needed. By default, an error will be presented as notification if opening was not possible.
	 */
	readonly ignoreError?: boolean;
}

export interface ITextEditorSelection {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber?: number;
	readonly endColumn?: number;
}

export interface ITextEditorOptions extends IEditorOptions {

	/**
	 * Text editor selection.
	 */
	selection?: ITextEditorSelection;

	/**
	 * Text editor view state.
	 */
	viewState?: object;

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	revealInCenterIfOutsideViewport?: boolean;
}
